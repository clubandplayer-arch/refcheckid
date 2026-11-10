# RefCheckID — runtime e operazioni

Aggiornamento: 10 novembre 2026. Questa guida descrive il runtime attuale;
gli audit storici ARCH-1 rimangono documenti storici.

## Modalità supportata

Node.js 24 (24.22.1 verificato), pnpm 9.15.0, un backend per istanza e disco persistente.
Il database SQLite contiene tutti i repository operativi, i metadati foto,
le sessioni di upload, le decisioni arbitrali e le sessioni di autenticazione.
Ogni comando applicativo e richiesta API usa una transazione; le richieste sono
serializzate per non esporre scritture parziali. WAL e synchronous=FULL sono attivi.
Questa soluzione non è un adapter PostgreSQL/Supabase e non abilita più repliche
applicative. Le migrazioni PostgreSQL esistenti restano separate.

Percorsi predefiniti, indipendenti dalla directory della shell:

- Database: `refcheckid-backend/storage/refcheckid.sqlite`.
- Oggetti: `refcheckid-backend/storage/refcheckid-photos-dev`.
- Importazione legacy: `refcheckid-backend/storage/refcheckid-photo-metadata-dev`.

Override: `REFCHECKID_DATABASE_PATH`, `REFCHECKID_PHOTO_STORAGE_ROOT`,
`REFCHECKID_PHOTO_METADATA_ROOT`. Usare percorsi assoluti su un volume persistente.
I JSON legacy vengono importati solo la prima volta per ciascun repository e non
sono più la fonte delle scritture del runtime. Non vengono cancellati o riscritti.
Un database esistente non viene sovrascritto dai seed o dai JSON.

## Sviluppo e demo

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Backend sulla porta 4000, Web sulla 3000. Da un altro terminale, se serve una demo:

```bash
pnpm demo:init
pnpm demo:verify
```

`demo:init` verifica lo stato di entrambe le distinte, il manifest e il workflow.
Se incompleto, riprende il bootstrap senza sostituire le foto stagionali già
presenti. Gli esiti arbitrali creati dal bootstrap sono fixture automatiche,
esplicitamente annotate: non attestano verifiche umane di identità.
Una foto con metadati presenti ma file assente causa un errore di verifica,
non una sostituzione automatica.

Per ripetere manualmente la gara, usare «Ripristina partita demo» dal dirigente
nell'ambiente demo. Il reset coinvolge entrambe le squadre, invalida snapshot,
decisioni, bozza e referto, riporta la gara a scheduled e conserva anagrafiche,
tesseramenti, versioni e approvazioni fotografiche. Non cancellare il database.
In produzione il reset è disabilitato salvo abilitazione esplicita
`REFCHECKID_SMOKE_RESET=true`; non abilitarlo sul servizio reale.

Le bozze di distinta e referto hanno comandi di salvataggio espliciti nell'UI.
Le decisioni arbitrali vengono salvate subito sul backend e recuperate dopo
ricaricamento. Il riconoscimento non può chiudersi con decisioni mancanti.
Le foto mancanti/non raggiungibili e i rifiuti richiedono note esplicite.
In assenza di documenti memorizzati l'UI indica la verifica dal vivo; non inventa
numero o scadenza del documento. Il riconoscimento è umano, non biometrico.

## Identità e configurazione di esercizio

Il backend in `NODE_ENV=production` non usa account o seed demo e richiede:

- `AUTH_SECRET`: segreto casuale di almeno 32 caratteri, fornito tramite secret store.
- `AUTH_USERS_FILE`: percorso a un file utenti protetto, esterno al checkout pubblico.
- `CORS_ORIGIN`: origine Web esplicita, senza wildcard.
- Percorsi dati persistenti e controllo dell'accesso al filesystem.

Il file utenti viene convalidato all'avvio. Le password sono scrypt con salt
casuale. Il provisioning non accetta password come argomento della shell:

```bash
cd refcheckid-backend
node scripts/provision-user.mjs /secure/refcheckid-users.json EMAIL RUOLO SCOPES_JSON < /secure/password-input
```

Sostituire EMAIL/RUOLO/SCOPES_JSON con dati reali. Ruoli: manager, referee,
federation, admin. Gli scope sono array di UUID: clubIds, federationIds,
refereeIds, authorizedMatchIds. Non inventare associazioni: devono corrispondere
alle anagrafiche reali. Non versionare il file utenti o il file di input.
Il provisioning richiede autorizzazione locale sul file; non è un endpoint pubblico.
Refresh ruota le sessioni; logout revoca anche il refresh. Le credenziali e i token
non sono registrati nei log applicativi di login.

```bash
pnpm build
pnpm -C refcheckid-backend start
# In un altro processo, dalla directory refcheckid-web:
pnpm exec next start --hostname 127.0.0.1 --port 3000
```

Il backend carica l'eventuale `.env` della sua directory; le variabili già
fornite dal processo hanno precedenza. Il Web usa il proxy same-origin `/api/v1`;
configurare `BACKEND_ORIGIN` prima della build se il backend non è sulla 4000.
Esporre il servizio reale tramite un ingresso HTTPS e un supervisore dei processi.
La configurazione dell'ingresso e le identità reali non sono state fornite in
questa sessione e non sono state inventate o pubblicate.

## Backup e ripristino

Con ambiente e percorsi configurati:

```bash
cd refcheckid-backend
pnpm backup /percorso/nuovo-backup
pnpm backup:verify /percorso/nuovo-backup
```

Il comando rifiuta una destinazione esistente. Esegue un backup SQLite coerente,
verifica integrity_check, copia originali e normalizzati referenziati dal database
e registra i checksum nel manifest. Conserva anche JSON legacy e, se configurato,
il file utenti. Un file foto mancante fa fallire il backup: non viene ignorato.
Conservare AUTH_SECRET separatamente nel secret store. Trattare il backup come dato
personale riservato e conservarlo con controllo accessi adeguato.

Per una prova di ripristino usare una directory nuova: verificare prima il backup,
copiare `state.sqlite` e `photos/`, configurare i due percorsi e avviare una nuova
istanza isolata. Non copiare il solo file di un database live ignorando il WAL.
Non sovrascrivere un'istanza esistente durante una prova di ripristino.

## Diagnostica

`GET /api/health` verifica che il processo sia disponibile; non dimostra da solo
la completezza di una gara. Con sessione autorizzata usare
`GET /api/v1/matches/:id/readiness`, le due distinte, i rispettivi photo-snapshots
e il photo-manifest. Per gli esiti usare recognitions e recognitions/workflow;
per il referto usare match-reports?matchId=....
