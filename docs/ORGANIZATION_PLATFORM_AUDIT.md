# Audit del gestionale federazioni e organizzazioni arbitrali

Data: 11 novembre 2026. Baseline verificata: main `39311d7`.
Ambito: audit del codice e proposta di architettura; nessuna modifica ai dati
staging, nessuna importazione o notifica inviata. Non è un collaudo del sistema
su migliaia di utenti simultanei. I nomi degli enti citati sono esempi di
configurazione, non una verifica delle loro attribuzioni istituzionali.

Aggiornamento: l’implementazione successiva a questo audit è descritta in
[ORGANIZATION_PLATFORM_OPERATIONS.md](ORGANIZATION_PLATFORM_OPERATIONS.md),
con procedura di avvio, verifiche e limiti effettivi. Le osservazioni della
baseline qui sotto restano riferite al codice prima dell’intervento.

## 1. Obiettivo e decisioni di prodotto

La federazione lavora dal sito web. L'arbitro usa principalmente l'app mobile;
la dirigenza può usare web e app. Il backend e le autorizzazioni sono comuni.
Ogni operatore ha un account personale: gli enti non condividono una password.

La piattaforma deve supportare organizzazioni sportive, leghe, enti di
promozione, settori arbitrali, comitati e sezioni territoriali. Una struttura
arbitrale può essere interna a un ente o appartenere a un'organizzazione
separata. Il nome dell'organizzazione non determina i suoi permessi.

Esempio da rendere possibile: il gestore del campionato provinciale concede
all'ufficio arbitrale competente per Siracusa il diritto di consultare le gare
di determinate competizioni e designare i propri ufficiali. L'operatore della
sezione può censire/importare arbitri, invitarli e assegnarli alle gare. Non
ottiene per questo accesso in modifica ai tesseramenti o alle foto dei giocatori.
La competenza deve essere configurata e autorizzata, non dedotta dal territorio
né dal fatto che la sezione abbia lo stesso nome della provincia.

Strutture amministrative e struttura sportiva restano separate:

- Organizzazione → unità nazionale/regionale/provinciale/sezione/altro.
- Disciplina → stagione → competizione/categoria → girone → giornata → gara.

La profondità amministrativa è variabile. Una competizione ha un gestore
responsabile e può avere collaborazioni e deleghe circoscritte.

## 2. Risultato dell'audit del codice

| Area | Stato verificato | Intervento necessario |
| --- | --- | --- |
| Federazioni | `Federation` contiene nome, codice fiscale e stato | Organizzazioni, unità territoriali, relazioni e competenze |
| Profili | Supabase autentica l'identità; `auth_profiles` fornisce un ruolo e liste di federazioni/società/arbitri | Appartenenze multiple, ruoli per unità e permessi per competizione |
| Società | Un `Club` appartiene a una federazione; società e squadra non sono distinte | Società stabile, squadre per disciplina/categoria, iscrizioni stagionali |
| Importazioni | Batch, parsing CSV, mappatura, validazione e commit presenti | Contesto organizzativo/sportivo, limiti, file Excel e lavoro asincrono |
| Commit importazioni | Abilitato per società, persone, tesseramenti giocatori e staff | Arbitri, calendari e designazioni hanno modelli/template ma il commit li rifiuta esplicitamente |
| Identificativi import | Società determinate anche dalla stagione; persone dai codici federali | Chiavi stabili con namespace dell'autorità e collegamenti ai vecchi ID |
| Gara | Federazione, due club, stagione, data/ora, luogo e un solo `refereeId` | Competizione, squadre, girone/giornata, periodi e squadra arbitrale |
| Accesso arbitri | Backend limita le gare al `refereeId` del profilo | Designazione con stati, accettazione, revoca e più incarichi per gara |
| Inviti | Non presente un flusso completo di inviti e attivazione | Invito personale, codice/login, scadenza, recupero e revoca |
| Designazioni | Campo arbitro sulla gara e template import | Modulo operativo, disponibilità, deleghe e conflitti |
| Eventi gara | `MatchEvent` generico e referto con riepilogo testuale/JSON | Eventi sportivi tipizzati e validati, punteggi e conferme per periodo |
| Live | Nessun flusso live federale completo verificato | Proiezione risultati, sincronizzazione, aggiornamento e stato di freschezza |
| Foto/riconoscimento | Workflow già presente | Preservare verifiche, approvazioni e snapshot storici; non rifare l'import foto |
| Persistenza cloud | PostgreSQL con documenti JSON e lock globale per comandi | Query limitate e indici; prima dei grandi import separare elaborazione lunga e transazioni |

Fonti principali:

- `refcheckid-backend/src/domain/federation/types.ts`
- `refcheckid-backend/src/domain/club/types.ts`
- `refcheckid-backend/src/domain/referee/types.ts`
- `refcheckid-backend/src/domain/match/types.ts`
- `refcheckid-backend/src/domain/event/types.ts`
- `refcheckid-backend/src/domain/report/types.ts`
- `refcheckid-backend/src/domain/federation-import-types.ts`
- `refcheckid-backend/src/services/federation-import-service.ts`, metodi
  `commitBatch`, `commitClubs`, `commitPlayerRegistrations`
- `refcheckid-backend/src/cloud/supabase-auth.ts`
- `refcheckid-backend/src/api/resource-access.ts`, funzione `matchAllowed`
- `refcheckid-backend/src/events/application-events.ts` (dispatcher in memoria; non è una coda notifiche persistente)
- `refcheckid-backend/src/cloud/postgres-store.ts`
- `refcheckid-backend/src/cloud/vercel-handler.ts` (body limit di 1 MiB)
- `refcheckid-web/src/lib/referee-api-client.ts`

Le liste sono attualmente filtrate anche dopo il caricamento nel middleware:
questo non basta per la scala prevista. I nuovi moduli devono applicare il
perimetro autorizzato e la paginazione nel database prima dell'arricchimento.

## 3. Modello organizzativo da realizzare

| Entità proposta | Scopo |
| --- | --- |
| Organization | Ente sportivo, lega o organizzazione arbitrale autonoma |
| OrganizationUnit | Comitato, delegazione, settore o sezione; parent nella stessa organizzazione |
| OrganizationRelationship | Rapporto tra organizzazioni separate; non conferisce da solo accesso ai dati |
| Membership | Utente, unità, ruoli/capacità, validità e stato |
| CompetitionGrant | Delega esplicita: chi concede, chi riceve, competizioni/stagioni, azioni e scadenza |
| Sport / Season / Competition / Group | Disciplina e struttura dei campionati |
| RulesetVersion | Regole della disciplina/competizione versionate |
| Club / Team / CompetitionEntry | Società stabile, squadre e iscrizioni ai campionati |
| ExternalIdentity | Codice sorgente nel namespace di ente/sistema/tipo entità |
| OfficialMembership | Collegamento tra arbitro, organizzazione/settore e disciplina, con qualifica e stato |
| Appointment | Designazione a una gara, ruolo, stato, autore e revisione |
| Invitation / LoginAlias | Attivazione personale e identificativo di accesso |
| NotificationOutbox | Invii e tentativi persistenti, separati dal salvataggio della gara |
| MatchUpdate / MatchEvent / PeriodConfirmation | Eventi, revisioni e conferme dei periodi |

Niente duplicazione automatica di una società tra anni o delegazioni. Un
identificativo locale è univoco solo dentro il namespace della sua autorità.
Non fondere persone di organizzazioni diverse soltanto per nome/cognome o per
una presunta corrispondenza: il collegamento richiede una verifica esplicita.
Una persona può essere arbitro in più discipline o avere altre appartenenze.

## 4. Permessi e isolamento

Ruoli iniziali: amministratore ente, responsabile territoriale, addetto
anagrafiche/tesseramenti, responsabile competizioni, designatore arbitrale,
revisore foto, dirigente società, arbitro e lettore risultati.

I ruoli sono pacchetti di capacità. La decisione del backend usa insieme:
identità autenticata, appartenenza attiva, organizzazione/unità, risorsa,
competizione/stagione e azione richiesta. Nessun client può scegliere il proprio
perimetro inviando un ID nel body.

| Operatore | Accesso previsto |
| --- | --- |
| Nazionale | Aggregati e strutture subordinate solo secondo capacità assegnate; consultazione e modifica separate |
| Regionale/provinciale | Proprie competenze e sottostrutture solo se incluse esplicitamente nel perimetro |
| Designatore esterno | Gare e dati arbitrali necessari nelle sole competizioni delegate |
| Dirigente | Proprie squadre e distinte; proposte foto secondo policy |
| Arbitro | Gare con incarico valido e dati necessari a svolgerlo; storico consultabile con regole proprie |

Vincoli: impedire cicli nella gerarchia, deleghe fuori dal perimetro del
concedente ed escalation di privilegi. Revoca di delega/appartenenza/incarico
ha effetto sul backend, anche con una vecchia schermata aperta. Il solo
possesso di un invito o la consegna di una notifica non autorizzano una gara.

## 5. Inviti e accesso degli arbitri

L'arbitro viene invitato alla piattaforma una volta; le singole gare generano
successivamente designazioni e notifiche. Un utente già attivo riceve una nuova
appartenenza o un incarico, non un duplicato dell'account.

Due accessi da supportare:

1. Email federale verificata e password scelta personalmente.
2. Codice personale di accesso e password scelta personalmente. Il codice è
   un identificativo, non una password e non deve bastare da solo per entrare.

Separare il codice personale permanente dal token di attivazione: quest'ultimo
è casuale, monouso, a scadenza e memorizzato in forma non recuperabile; può
essere revocato e rigenerato. Se si usa una matricola federale come login,
serve il contesto dell'ente o un alias globale univoco per evitare collisioni.
Le password non devono comparire in Excel, inviti o anagrafiche degli operatori.

Il backend attuale usa Supabase con autenticazione email/password: il login con
codice non è già disponibile. Richiede un adattamento server dell'identità e
un flusso di recupero coerente con il provider, senza creare una seconda tabella
di password nell'applicazione. Prima si rilascia il percorso email verificato;
poi il codice con recupero verificato. In assenza di email/recapito verificato,
il recupero deve passare da un operatore autorizzato che verifica l'identità:
la sola conoscenza del codice personale non consente il reset.

Prevedere scadenza, blocco tentativi, revoca accesso e traccia delle operazioni.
Nessuna email o push deve essere inviata durante una semplice anteprima import.

## 6. Designazione di una gara

Flusso: bozza → inviata → accettata oppure indisponibilità/rifiuto.
Revoca, annullamento e sostituzione sono eventi tracciati, non cancellazioni
silenziose. La modifica di orario/impianto dopo accettazione deve essere
notificata e può richiedere una nuova conferma secondo le regole operative.

Prima di inviare: verificare delega del designatore, qualifica, disciplina,
appartenenza attiva, indisponibilità e sovrapposizione oraria. Distanza e tempi
di viaggio inizialmente possono generare avvisi; non promettere un motore di
designazione automatica.

Gestire ruoli multipli: arbitro principale, assistenti, ufficiali al tavolo,
giudici o altri incarichi definiti dalla disciplina. La gara non deve dipendere
a regime da un singolo campo `refereeId`.

L'app apre «La tua prossima gara» e separa incarichi futuri, richieste da
accettare e storico. L'arbitro non vede il calendario generale delle altre gare.
L'accesso operativo dipende dallo stato valido dell'incarico; lo storico resta
consultabile secondo la politica concordata e non consente modifiche tardive.

## 7. Importazioni senza confusione

Contesto sempre visibile: organizzazione/unità → sport → stagione → competizione
(se applicabile). È derivato dai permessi; non si accetta un ente diverso
inserito nel file per ampliare il perimetro.

Ordine consigliato: organizzazione/regole → società → squadre → anagrafiche e
tesseramenti → competizioni e iscrizioni → arbitri → calendari → designazioni.
Calendario e designazioni restano importabili separatamente.

Wizard: modello versionato → file → riconoscimento e mappatura colonne →
validazione → anteprima di nuovi/aggiornati/invariati/errori → conferma → rapporto.
Template e formati personalizzati condividono lo stesso schema normalizzato.
Supportare CSV UTF-8 e XLSX senza macro; le date ambigue non vengono interpretate
silenziosamente e il fuso della competizione è esplicito.

Controlli: duplicati nel file e nel sistema, codici mancanti, riferimenti a
società/competizioni sconosciute, stagione errata, squadre non iscritte,
conflitti tra righe, dati fuori competenza e partita duplicata. File errori
scaricabile con numero riga/colonna e spiegazione. Una riconferma dello stesso
batch non deve riscrivere né duplicare i record.

Le chiavi esterne devono essere stabili; l'identità della società non include
la stagione. Servono mappa dei vecchi ID e migrazione verificata: non cambiare
UUID già referenziati da foto, tesseramenti, distinte o referti.

Per grandi file: upload privato diretto, job persistente, avanzamento, chunk,
checkpoint, retry idempotente e annullamento prima del commit. L'import attuale
sincrono e il limite body di 1 MiB non sono adatti a Excel grandi. Nessuna
transazione deve restare aperta durante parsing lento, chiamate esterne o invii.
Definire esplicitamente l'atomicità: anteprima validata, blocchi applicati con
stato visibile, niente esito «completo» dopo applicazione parziale. Il ripristino
non può cancellare attività di gara già prodotte dopo l'import.

## 8. Aggiornamenti gare e ufficialità

Stati da distinguere nell'interfaccia:

- Live provvisorio: evento durante il gioco inserito da ufficiale autorizzato.
- Periodo confermato dall'arbitro: riepilogo autorevole per quel periodo.
- Fine gara confermata: risultato finale confermato dall'arbitro.
- Referto inviato: documento completo chiuso dall'arbitro.
- Omologato: eventuale successivo atto federale distinto.

La conferma di fine periodo/fine gara comprende anche «nessun evento». Serve
una checklist di punteggio ed eventi prima dell'invio; non un generico autosave
scambiato per conferma. La chiusura del referto richiede il riepilogo finale;
si può correggere con una revisione tracciata e motivata, conservando le versioni.

Per il calcio: reti/autoreti, marcatori, ammonizioni, espulsioni e sostituzioni
con soggetti corretti della distinta e minuto/recupero/periodo. Per altre
discipline servono set, punti e provvedimenti appropriati. Regole versionate
per competizione; una modifica non riscrive le gare storiche.

Il telefono durante il gioco non è obbligatorio. L'arbitro o un ufficiale
abilitato può inserire gli eventi; la conferma del periodo è attribuita
all'arbitro responsabile. In assenza di rete: coda locale, indicazione «da
sincronizzare», retry con ID operazione univoco. Il server rileva conflitti di
revisione e richiede risoluzione; niente sovrascrittura silenziosa tra dispositivi.

La federazione vede il dato salvato, autore, stato e ora dell'ultimo
aggiornamento. Se manca la rete non si promettono risultati in tempo reale.
Obiettivo iniziale proposto: aggiornamento entro 10 secondi dal commit server
per utenti connessi; misurarlo prima di dichiararlo garantito.

Usare un riepilogo gara indicizzato e aggiornamenti autorizzati per gara/
competizione (polling leggero iniziale, realtime gestito dove utile). Non
ricaricare tutte le gare e tutti gli eventi a ogni cambiamento. La notifica
parte da una outbox persistente e non determina l'esito della transazione gara.

## 9. Scala, migrazione e verifiche

- Paginazione e filtri in SQL; indici per organizzazione, competizione, stagione,
  stato, appuntamenti e data; evitare query per riga su intere liste.
- Tenere privata la scrittura diretta dei client; se si introduce realtime
  Supabase, autorizzare anche canali/policy e revocare le sottoscrizioni.
- Misurare separatamente anagrafiche, file importati, gare simultanee e operatori:
  4.000 foto non equivalgono a 4.000 utenti concorrenti.
- Test proposti: import da 10.000 tesserati con retry e duplicati; calendari
  da 1.000 gare; lettura di una sola pagina senza trasferire tutto il dataset;
  doppia designazione concorrente; doppio invio di conferma da mobile.
- Migrazione additiva con backup verificato: mappare federationId e clubId
  esistenti, affiancare nuovi riferimenti, compatibilità transitoria e verifica
  dei conteggi. Nessun reset dei dati per introdurre le organizzazioni.
- I test devono negare accessi incrociati anche via API, non solo nascondere menu.

## 10. Piano di consegna e criteri di accettazione

| Fase | Consegna | Criterio di uscita |
| --- | --- | --- |
| M1 — Fondazioni | Organizzazioni, unità, appartenenze, competenze e deleghe; mappatura dati esistenti | Due enti separati; gerarchia senza cicli; appartenenze e deleghe di base senza escalation; revoca effettiva |
| M2 — Campionati | Sport, stagioni, categorie, gironi, squadre e regole calcio versionate | Una società con due squadre/competizioni senza duplicati e senza rotture delle distinte attuali |
| M3 — Dati | Nuovo wizard e import asincrono; completamento commit arbitri e calendari | Anteprima corretta, file errori, retry sicuro e prova 10.000 righe; nessun cambio UUID storico |
| M4 — Arbitri | Anagrafiche, appartenenze, inviti email/codice, deleghe operative e designazioni | Scenario Siracusa completo; accettazione/rifiuto/sostituzione, notifica tracciata, accesso revocato senza perdere storico |
| M5 — Risultati | Eventi tipizzati, fine periodo/fine gara, riepilogo federale, offline e revisioni | Aggiornamento coerente su due dispositivi; nessun doppio evento dopo retry; stato ufficiale esplicito |
| M6 — Estensione | Seconda disciplina e test di carico sui flussi completi | Regole e incarichi diversi funzionano senza copiare l'intera applicazione |

### Primo intervento implementativo: M1, diviso in PR piccole

1. Schema organizzazioni/unità e migrazione additiva. Convertire ogni federazione
   esistente in una radice collegata, conservando i suoi riferimenti legacy.
2. Appartenenze e matrice delle capacità; servizio unico di autorizzazione con
   test negativi e revoche. I profili legacy continuano a funzionare nel periodo
   transitorio, senza attribuire automaticamente nuovi diritti.
3. Schermata web «Struttura e operatori», contesto selezionato persistente e
   breadcrumb. Cambio contesto svuota le cache con dati dell'altro perimetro.
4. Delega di competenze con concessione/revoca tracciata; l'assegnazione a
   competizioni concrete viene completata con M2. Non introdurre subito un
   permesso territoriale generico che consenta tutte le gare di una provincia.

Prima prova pilota: un ente sportivo con comitato regionale e delegazione
provinciale, un'organizzazione arbitrale con una sezione territoriale, due
competizioni di cui una delegata e una non delegata, due società e due arbitri.
Usare dati sintetici isolati. La sezione vede solo la competizione autorizzata;
non può alterare le anagrafiche sportive e non può accedere ad altri territori.

## 11. Punti da validare durante il pilota

Non bloccano schema e permessi di base: modelli reali di esportazione degli
enti; competenze effettive dei designatori; tempi di accettazione e sostituzione;
recapito disponibile agli arbitri senza email; gestione dei minori; chi omologa
i risultati e chi può correggerli; primo sport successivo al calcio.

Non fissare una data di rilascio complessiva prima di misurare M1 e un'importazione
reale. Ogni fase deve avere test, documentazione operativa e un rilascio verificabile.
