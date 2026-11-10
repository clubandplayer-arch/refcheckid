# RefCheckID: Vercel + Supabase

Questa integrazione prepara un **collaudo staging**. Nessun servizio remoto viene
creato e nessun dato viene trasferito da una build o da un deploy. Il dominio
Aruba resta valido. Il Codespace con SQLite resta utilizzabile separatamente.

## Architettura e limiti verificabili

- Un progetto Vercel esegue Next.js e le API Node.js sotto `/api/*`, usando il
  router e i controlli di autorizzazione già presenti nel backend.
- PostgreSQL Supabase conserva i documenti esistenti in `refcheckid.entities`.
  UUID, riferimenti, approvazioni, foto e record archiviati non vengono rinumerati.
  È una prima migrazione compatibile, **non** la conversione in tabelle normalizzate.
- Supabase Auth gestisce password e refresh token. Il profilo applicativo privato
  collega l'UUID Auth all'actorId esistente e assegna ruolo e ambiti. Il backend
  verifica il token con Auth e rilegge il profilo a ogni richiesta; i campi
  `user_metadata` modificabili dall'utente non concedono privilegi.
- Le foto sono nel bucket privato `refcheckid-photos`. Gli upload passano
  direttamente dal browser a Supabase con URL firmato, poi il backend controlla
  formato, dimensioni e hash e registra la versione e la normalizzazione.
- Le letture fotografiche autorizzate reindirizzano a URL Storage firmati per
  60 secondi. Non si salvano foto nel filesystem Vercel e non si espongono chiavi
  privilegiate al browser. Il controllo applicativo genera inoltre URL di accesso
  al contenuto di durata limitata; sono bearer URL da non condividere.
- Le transazioni PostgreSQL usano un advisory lock comune a tutte le istanze:
  i comandi restano atomici anche con più funzioni Vercel. L'accesso è inizialmente
  serializzato e diversi filtri restano applicativi. **Prima dell'uso su larga
  scala servono test di carico e filtri SQL/lock più granulari.**
- Database e Storage non costituiscono un'unica transazione distribuita. Un errore
  dopo l'upload può lasciare un file senza riferimento; non cancellarlo
  automaticamente e non ripetere decisioni/approvazioni per correggere un errore.
- Il limite attuale è 5 MB per foto. Vercel riceve solo richieste JSON fino a 1 MB;
  non accetta upload base64. Il mobile potrà usare gli stessi endpoint e ruoli.

## 1. Creare Supabase staging

Creare un progetto dedicato **refcheckid-staging**, separato da Club and Player,
in una regione europea (preferibilmente Francoforte). Conservare la password
database in un gestore password. Non inserirla in Git, chat o screenshot.

Disabilitare la registrazione pubblica in Authentication; creare/invitare solo
gli utenti del collaudo. I vecchi login `.local` e `Password123!` non vengono
trasferiti. Supabase Auth deve avere utenti reali e credenziali nuove.

Applicare **soltanto** la nuova migrazione
`supabase/migrations/202611100001_runtime.sql` tramite SQL Editor, oppure con il
normale flusso Supabase CLI collegato a questo progetto. Le vecchie directory
`refcheckid-backend/supabase/` e `drizzle/` sono materiale storico e non sono il
percorso di migrazione di questa integrazione. In particolare le vecchie policy
`photos` permettevano letture troppo ampie: non applicarle.

Il nuovo schema non è esposto via Data API. RLS è attivo senza policy per anon e
authenticated: i client usano le API RefCheckID, che applicano gli ambiti di
federazione, club e gara. Non aggiungere policy permissive al nuovo bucket.

## 2. Variabili server

Configurare i valori seguenti in **Vercel Project Settings → Environment
Variables**, senza prefisso `NEXT_PUBLIC_` per i segreti:

| Variabile | Staging |
| --- | --- |
| `REFCHECKID_RUNTIME` | `supabase` |
| `REFCHECKID_DATA_ENV` | `staging` |
| `SUPABASE_URL` | URL HTTPS del progetto |
| `SUPABASE_SERVER_KEY` | Secret key server o legacy service_role, mai anon/publishable |
| `DATABASE_URL` | Connection string Supavisor transaction pooler, porta 6543, con `sslmode=verify-full` |
| `AUTH_SECRET` | Valore casuale nuovo di almeno 32 caratteri per firmare URL foto |
| `REFCHECKID_DEMO_AUTO_BOOTSTRAP` | `false` |
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` |

Per il trasferimento usare gli stessi valori in un file `.env` **ignorato da
Git** nel backend, oppure nelle impostazioni segrete dell'ambiente. Non copiare
valori da Club and Player. Le password con caratteri speciali devono essere
codificate correttamente nella connection string. Mantenere la verifica TLS.

Non impostare `BACKEND_ORIGIN` nel deploy cloud. Non impostare percorsi SQLite,
directory foto o `AUTH_USERS_FILE` su Vercel. I percorsi locali restano solo per
il collaudo nel Codespace.

## 3. Trasferire la copia verificata, preservando foto e dati

Usare un **backup immutato**, non il database operativo già modificato dal
collaudo. Lo ZIP originale è la fonte ripetibile. Il piano predefinito non
richiede credenziali e non contatta servizi remoti:

```bash
pnpm -C refcheckid-backend supabase:transfer /percorso/backup/data
```

Controllare inventario e nomi effettivi: il pacchetto 20261110 contiene
**ASD RefCheck Home/Away**, non dimostra il recupero del vecchio Atletico Aurora.
Contiene anche record storici cancellati logicamente: il numero totale di record
non coincide necessariamente con quello dei record attivi.

Per applicare allo staging esplicitamente configurato:

```bash
pnpm -C refcheckid-backend supabase:transfer /percorso/backup/data --apply
```

Lo script verifica tutti gli hash e SQLite in sola lettura, richiede una
destinazione database vuota e URL database/Storage dello stesso progetto. Esclude
sessioni, grant temporanei, upload incompleti e profili Auth. Per ogni foto
riutilizza solo file remoti con hash identico, non sovrascrive file esistenti e
verifica nuovamente il download. Importa i documenti in un'unica transazione e
li confronta prima del commit. Se fallisce, può lasciare i file già caricati:
un nuovo tentativo li verifica e li riutilizza. Non cancella nulla dalla fonte.

Non eseguire `demo:init`, reset o bootstrap. Non committare ZIP, foto, database,
profili personali o file `.env` nel repository.

## 4. Collegare gli account ai ruoli

Creare/invitare gli utenti in Supabase Authentication e prendere i relativi UUID.
Creare un file profilo fuori dal repository, ad esempio:

```json
{
  "id": "UUID_UTENTE_SUPABASE",
  "actorId": "UUID_ATTORE_APPLICATIVO_ESISTENTE",
  "email": "utente@example.com",
  "displayName": "Dirigente casa",
  "role": "manager",
  "enabled": true,
  "clubIds": ["UUID_CLUB_CASA"],
  "federationIds": ["UUID_FEDERAZIONE"],
  "refereeIds": [],
  "authorizedMatchIds": []
}
```

Assegnare gli identificativi del dataset verificato, non quelli di un'altra
demo. Conservare gli actorId per mantenere i riferimenti di audit preesistenti.

```bash
pnpm -C refcheckid-backend supabase:profile /percorso/privato/profilo.json
```

Il comando verifica identità/email Auth e l'esistenza dei riferimenti. Ruoli e
ambiti si modificano soltanto da un canale server amministrativo; non dal browser.
Il logout Supabase revoca il refresh; i JWT di accesso già emessi possono restare
validi fino alla scadenza secondo il comportamento Auth. Per bloccare subito
l'accesso applicativo disabilitare il profilo server, riletto a ogni richiesta.

## 5. Creare Vercel staging

Importare `clubandplayer-arch/refcheckid` in un nuovo progetto **refcheckid-staging**.
Root Directory: **refcheckid-web**; abilitare l'inclusione dei file esterni alla
Root Directory. Framework Next.js; Node.js **24.x**. Install e build sono nel
`refcheckid-web/vercel.json`. Il workspace include il backend come dipendenza.

Il progetto dedicato `refcheckid-staging` può usare gli slot Vercel **Production
and Preview**, entrambi con `REFCHECKID_DATA_ENV=staging` e credenziali del solo
Supabase staging. Lo slot Vercel Production non indica l'ambiente dati reale.
Dopo merge verificato della PR si può importare `main`; prima del merge usare il
branch di integrazione. Non collegare ancora il dominio pubblico.
Il codice rifiuta una Preview marcata come dati production; è comunque necessario
controllare che le credenziali configurate puntino davvero al progetto staging.

I deploy da PR non fidate non devono ricevere segreti. Mantenere la protezione
Preview disponibile sul proprio piano e usare account invitati per il collaudo.

Testare login/logout/refresh, 18 giocatori e 4 staff per club, 44 approvazioni,
foto ufficiali, separazione casa/ospite, invio distinte, snapshot, riconoscimento
e referto. Verificare la persistenza dopo un nuovo deploy e accessi anonimi negati
sia ai dati sia allo Storage. Una build verde non dimostra che il cloud funzioni.

## 6. Produzione e dominio Aruba, dopo collaudo umano

Preparare un progetto Supabase production separato e variabili Vercel Production
dedicate (`REFCHECKID_DATA_ENV=production`). Non riutilizzare automaticamente
utenti, password o dati fittizi del collaudo. Definire import reale, backup,
ripristino provato, monitoraggio errori, limiti di spesa e conservazione delle foto.
I backup del database non includono automaticamente i byte degli oggetti Storage:
serve un backup separato delle foto e una verifica dei relativi hash.

Solo allora aggiungere `app.refcheckid.com` a Vercel e copiare in Aruba i record
DNS mostrati da Vercel. Non inventare IP e non cambiare i record della posta.
Configurare anche Site URL e redirect consentiti in Supabase Auth per gli esatti
domini di staging/produzione. HTTPS viene gestito da Vercel.

Rollback: ritornare al deploy precedente e al suo database compatibile; mantenere
intatto il backup locale. Un rollback del codice non ripristina il database e non
deve comportare cancellazioni o rigenerazioni di foto.

## Stato della consegna

Codice, migrazione e strumenti sono verificabili localmente. La creazione dei
progetti, migrazione SQL remota, trasferimento effettivo, provisioning account,
deploy Preview e verifica su Supabase/Vercel reali richiedono accessi configurati.
Non sono dichiarati eseguiti da questo documento.
