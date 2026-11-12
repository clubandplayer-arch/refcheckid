# Gestionale enti e designazioni: implementazione e avvio

Data: 11 novembre 2026. Questo documento accompagna l'implementazione sulla
branch `codex/organization-platform-audit`; l'audit iniziale resta in
[ORGANIZATION_PLATFORM_AUDIT.md](ORGANIZATION_PLATFORM_AUDIT.md).

## Cosa è disponibile

Il sito `/federation`, sezione **Gestione ente**, gestisce organizzazioni,
strutture territoriali, operatori, società, squadre stagionali, tesseramenti,
rose, campionati/gironi, calendari, arbitri, deleghe e designazioni. Ogni
operatore usa credenziali personali. Un account può avere più incarichi e
accedere alle aree abilitate dal menu; non occorre condividere account.

Le organizzazioni sportive e quelle arbitrali sono separate. La gerarchia
ammette nazionale, regionale, provinciale, sezione, settore, distretto e altri
livelli, fino a 32 passaggi. Nomi come LND e AIA sono configurazioni, non ruoli
speciali nel codice. Le competenze non vengono assegnate automaticamente dal
nome o dal territorio.

Un campionato è identificato anche da disciplina, stagione, categoria e
girone. Le squadre stagionali appartengono a società stabili. Una persona può
appartenere a più rose della stessa società/stagione; il dirigente vede nella
gara la rosa della squadra interessata, non tutti i tesserati di tutte le
categorie della società.

| Incarico | Competenze nella struttura assegnata |
| --- | --- |
| Amministratore ente | Struttura, operatori, anagrafiche, campionati, deleghe e risultati |
| Tesseramenti e anagrafiche | Società, squadre, tesserati, rose e censimento arbitri |
| Responsabile campionati | Campionati, iscrizioni, calendario, risultati e omologazione |
| Designatore arbitrale | Arbitri, inviti arbitro, indisponibilità e designazioni autorizzate |
| Revisore foto | Richieste foto delle società comprese nella propria competenza |
| Consultazione | Lettura nella propria competenza |
| Arbitro | Proprie designazioni e gare accettate, secondo l'incarico |
| Dirigente società | Distinte e foto dei tesserati delle proprie società |

L'estensione alle sottostrutture è esplicita. Le revoche vengono controllate
anche sulle API preesistenti, non soltanto nascondendo pulsanti. Un operatore
arbitrale non riceve accesso generale al database sportivo o alle fotografie.

## Preparazione dello staging

1. Mantenere le configurazioni Vercel/Supabase già usate per il runtime cloud:
   Node 24, `REFCHECKID_RUNTIME=supabase`, `REFCHECKID_DATA_ENV=staging`,
   `SUPABASE_URL`, `SUPABASE_SERVER_KEY`, `DATABASE_URL` con TLS verificato e
   `AUTH_SECRET`. Le credenziali server non vanno nei campi `NEXT_PUBLIC_*`.
2. Dopo la migrazione runtime già presente, applicare
   `supabase/migrations/202611110003_platform_indexes.sql` nello stesso
   database. È additiva: aggiunge indici, non sostituisce persone, società,
   tesseramenti, foto o distinte. `Success. No rows returned` è normale per
   queste istruzioni SQL.
3. Distribuire questa branch con il lockfile aggiornato. Il runtime richiede
   `pg`, `sharp` ed `exceljs`, incluse le dipendenze opzionali/native di Sharp.
   Non disabilitare le dipendenze opzionali durante l'installazione.
4. Entrare con il gestore federale esistente. In **Attiva la gestione della tua federazione**, collegare
   la federazione già presente invece di crearne una seconda con un nuovo ID.
5. L’amministratore centrale RefCheckID registra l’organizzazione arbitrale autonoma da **Registro enti autonomi** e invita il suo amministratore. La lega non la crea: la seleziona dall’elenco degli enti già registrati quando concede una delega.
   I nuovi operatori ricevono competenze tramite appartenenze organizzative;
   non aggiungere loro manualmente ampi `federationIds` nel database.

L'intervento non applica migrazioni e non invia comunicazioni sullo staging.
L'applicazione locale e i test usano dati sintetici isolati.

## Esempio operativo: campionato provinciale e sezione arbitrale

1. Nell'ente sportivo creare Regione → Delegazione provinciale. Selezionare la
   delegazione dal menu **Struttura**: i percorsi completi distinguono unità
   con lo stesso nome.
2. Importare/collegare le società; creare le squadre della stagione, indicando
   disciplina e categoria.
3. Importare giocatori e staff. Il campo facoltativo `team_code` li assegna
   direttamente alla rosa. In **Tesserati** si possono assegnare e rimuovere
   tesserati da una rosa, oppure sospendere/riattivare il tesseramento.
4. Creare campionato e girone, poi iscrivere le squadre. Caricare il calendario.
5. L’amministratore dell’organizzazione arbitrale crea al suo interno la sezione competente e il suo
   designatore. Censire o importare gli arbitri della sezione.
6. Nell'ente sportivo aprire **Deleghe**, scegliere campionato, organizzazione
   arbitrale, sezione destinataria e scadenza. La delega concede lettura e
   designazione su quel campionato. La revoca interrompe l'operatività delle
   designazioni che dipendono da quella delega.
7. Il designatore accede al campionato delegato e prepara le designazioni.
   **Invia designazione** le rende disponibili agli arbitri. L'importazione
   delle designazioni crea bozze e non spedisce automaticamente gli incarichi.
8. L'arbitro accetta o comunica indisponibilità nella propria dashboard. La
   gara diventa operativa dopo l'accettazione. Il collegamento nella singola
   designazione apre esattamente la distinta di quella gara.

Una variazione di calendario richiede una motivazione, incrementa la revisione
e richiede una nuova accettazione degli arbitri già invitati/assegnati.
L'annullamento revoca gli incarichi. Le indisponibilità e le sovrapposizioni
sono controllate all'invio e all'accettazione. L'attuale finestra considera la
durata complessiva prevista della gara, non calcola tempi di viaggio.

## Inviti, accesso e recupero

In **Operatori e inviti**, scegliere il destinatario e il ruolo. Per un arbitro
collegare la sua anagrafica; per un dirigente scegliere la società.

- Il link di attivazione, valido sette giorni, viene mostrato una sola volta.
  Va consegnato personalmente al destinatario: non è implementato un invio
  automatico delle email di invito.
- Il destinatario sceglie una password di almeno 12 caratteri. Il codice
  personale rimane un identificativo di login; il token del link è monouso.
- Senza email, l'account può accedere con codice e password. Non serve creare
  preventivamente utenti fake in Supabase.
- Con email, l'indirizzo deve essere confermato tramite Supabase. È necessario
  configurare correttamente il servizio email/SMTP e i relativi limiti. Un
  account esistente deve dimostrare il possesso della sua password prima di
  ricevere la nuova appartenenza; il token non consente di appropriarsene.
- **Recupera accesso dopo verifica identità** genera un link di 15 minuti.
  Conserva l'identità dell'arbitro, invalida le vecchie sessioni applicative e
  non riattiva appartenenze revocate. Non sostituisce la verifica umana da parte
  del responsabile.

Le designazioni e le variazioni generano notifiche persistenti interne. La
lista delle designazioni viene aggiornata ogni 30 secondi. Non sono notifiche
push native e non viene promesso un recapito email/SMS.

## Importazioni

Formati: CSV UTF-8, separatore `;` o `,`, oppure XLSX senza macro/formule,
un solo foglio, massimo 5 MB e 10.000 righe per file. Le date di gara devono
includere il fuso, per esempio `2026-12-01T15:00:00+01:00`. Le date di nascita
usano `YYYY-MM-DD`.

La pagina fornisce il modello per ciascun tipo di dati. Se le intestazioni
obbligatorie hanno nomi diversi viene proposta la mappatura. Per i campi
facoltativi usare le intestazioni del modello.

Ordine consigliato: **società → squadre → tesserati/rose → campionati e
iscrizioni → calendario → arbitri e designazioni**. L'ordine delle ultime due
anagrafiche è indipendente; le loro relazioni devono esistere prima delle
relative designazioni.

L'upload cloud usa un URL firmato privato. Checksum e dimensione vengono
verificati. La validazione precede la conferma; gli errori sono visibili per
riga ed esportabili in CSV. Nessuna anagrafica o notifica viene creata durante
l'anteprima. Gli aggiornamenti già presenti vengono rivalidati quando il
blocco viene applicato, perché nel frattempo altri operatori potrebbero aver
modificato i dati.

Ogni richiesta lavora su massimo 100 righe, con checkpoint durabile. In
PostgreSQL le letture del blocco vengono pre-caricate e le scritture accumulate
sono applicate con una sola istruzione batch, nella stessa transazione del
checkpoint. È possibile sospendere, riaprire la pagina e riprendere dalla
cronologia. Un errore non lascia metà dell'ultimo blocco applicata. I blocchi
precedenti già confermati rimangono applicati.

La ripetizione dello stesso file nello stesso ambito riapre il medesimo lavoro;
le chiavi esterne rendono idempotente la registrazione dei dati. Per correggere
un file bloccato dall'anteprima, scaricare il rapporto, correggere il file e
ricaricarlo. Una gara esistente con dati diversi si modifica da **Variazione
calendario**, per notificare correttamente gli arbitri.

`existing_club_id` ed `existing_person_id` collegano dati storici, con competenza
amministrativa adeguata. I tesseramenti esistenti della stessa persona,
società e stagione conservano il loro UUID: anche le associazioni alle foto
restano valide. Non viene eseguito un abbinamento automatico per omonimia.

L'import non elimina automaticamente le righe assenti dal nuovo file. Per un
tesseramento cessato usare `status=ended`; per sospenderlo `status=suspended`.
Le rose possono essere aggiornate rimuovendo l'assegnazione nella pagina.

## Gara, aggiornamenti e ufficialità

L'arbitro principale, dopo la chiusura del riconoscimento, registra eventi e
conferma ogni periodo anche quando il risultato è invariato. Gli assistenti
possono inviare dati provvisori; le conferme ufficiali spettano al principale.

Sono distinti **provvisorio**, **fine periodo confermata**, **fine gara
confermata**, **referto inviato** e **omologazione federale**. La federazione
consulta risultato, eventi, ora dell'ultimo aggiornamento e stato del referto
nella scheda **Risultati**, aggiornata ogni dieci secondi. L'omologazione richiede
risultato finale e referto inviato e registra autore/data.

Gli eventi e le bozze non inviate sono salvati localmente per utente e gara.
Una richiesta non confermata dal server mantiene il suo identificativo per
ritentare senza duplicarla. Una revisione diversa produce un conflitto, non
una sovrascrittura silenziosa; l'arbitro può confrontare e scartare
esplicitamente la bozza locale. Le rettifiche di dati già confermati richiedono
una motivazione. Dopo l'invio del referto la schermata è in sola lettura.

La modalità offline richiede di avere aperto la gara mentre si era connessi;
non sostituisce un'app nativa offline con tutti gli allegati scaricati. Il
server non indica come ricevuto un aggiornamento ancora sul dispositivo.

Il riconoscimento rimane basato sul volto e sulla foto approvata; il documento
è facoltativo in caso di dubbio. Ogni nuova proposta foto, anche la prima
sostituzione ordinaria annuale, richiede approvazione federale. Vedi
[RECOGNITION_PHOTO_POLICY.md](RECOGNITION_PHOTO_POLICY.md).

## Discipline e limiti dichiarati

Sono presenti regole iniziali per calcio (gol, cartellini, sostituzioni), basket
(punti da 1/2/3 e sostituzioni) e pallavolo (set e sostituzioni). Periodi,
durata e numero dei titolari sono configurabili; i set supportano il meglio di
tre o cinque. Non costituiscono una codifica completa di tutti i regolamenti:
supplementari, tiri di spareggio, punteggi interni ai set, classifiche e
provvedimenti disciplinari automatici richiedono estensioni specifiche.

Il modello delle distinte esistente distingue i lati tramite società: una
gara fra due squadre della stessa società viene rifiutata esplicitamente.
Il modulo non introduce un nuovo client mobile nativo; le API e le schermate
web responsive sono condivisibili con un futuro client.

Le scritture cloud mantengono il lock transazionale generale del runtime
esistente. I blocchi brevi e le pagine limitate riducono il lavoro per richiesta;
non sono una prova di capacità su migliaia di operatori simultanei. La fase di
verifica dello staging deve misurare latenza, timeout, contesa e limiti dei
servizi prima di estendere il carico.

Gli esiti del collaudo locale sono in
[ORGANIZATION_PLATFORM_VERIFICATION.md](ORGANIZATION_PLATFORM_VERIFICATION.md).

## Verifica ripetibile

- `pnpm lint`, typecheck backend e web, `pnpm test`, `pnpm build`.
- `pnpm verify:cloud-bundle`: copia soltanto i file tracciati del deploy Next,
  carica realmente Sharp/ExcelJS/PG e verifica import XLSX/CSV, scritture batch
  e paginazione con PostgreSQL PGlite. Solo provider Auth/Storage e connessione
  PG sono sostituiti da adattatori locali sintetici; non usa lo staging.
- `pnpm test:acceptance` con web production e backend sulla porta 4000:
  Chromium verifica anche configurazione territoriale, import CSV, invito,
  attivazione/login per codice e accettazione di una designazione delegata.
- Test backend: importazioni di 10.000 società e 10.000 giocatori, ripresa,
  identità storiche, deleghe, revoche, recupero accesso e risultati/referto.
- Test web: conservazione di bozze e richieste offline, retry idempotente,
  conflitti di revisione e conferme riservate al principale.

Per il collaudo manuale creare gli account dalla schermata degli inviti: un
responsabile sportivo, un designatore di sezione, due arbitri e due dirigenti.
Gli account senza email non richiedono caselle da preparare. Se si vuole
verificare anche il recapito e la conferma email, usare indirizzi reali sotto
il proprio controllo e password scelte dai titolari; non indirizzi fittizi
irraggiungibili.

## Taccuino, referti riservati e portale risultati

Per il rilascio successivo e gli accessi per ruolo consultare [la guida operativa](RESULTS_NOTEBOOK_OPERATIONS.md). La separazione degli endpoint, i confini dei dati pubblici e le verifiche sono descritti nel [contratto API](RESULTS_PRIVACY_API.md). La pubblicazione resta disabilitata finché proprietario e amministrazione centrale non la autorizzano separatamente.

## Profili e configurazione effettiva

La pagina **Profilo e loghi** permette di gestire l’identità visiva degli enti, i loghi club e la foto personale dell’arbitro. Per gli operatori federali include una verifica della configurazione del deployment. Consultare [accessi, limiti e prove su staging](IDENTITY_PROFILES_AND_STAGING.md).
