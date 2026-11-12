# API del gestionale organizzazioni

Prefisso: `/api/v1/platform`. Le API usano lo stesso bearer token delle altre
aree. Solo `POST /activate` è pubblico. Il ruolo nel body non conferisce
privilegi; gli ambiti sono risolti dalle appartenenze attive nel database.
`x-refcheckid-role` può selezionare soltanto un'area già abilitata al titolare.

## Convenzioni

Gli ID sono UUID server-side. Le richieste JSON di creazione/update contengono
`organizationId` e `unitId`, salvo quando l'ambito viene ricavato dall'entità
(competenze, gara, designazione, ecc.). Date/ore ISO 8601 devono includere il
fuso; le date di nascita usano `YYYY-MM-DD`.

Le liste restituiscono `{items,total,nextCursor}` con massimo 50 elementi,
accettano `cursor` opaco e, dove previsto, `search`. `total` è limitato
all'ambito autorizzato. `/context`, `/units` e `/my-officials` restituiscono
metadati circoscritti all'utente, non registri di migliaia di persone.

Gli errori di dominio hanno `{error:'PLATFORM_ERROR',message}`. I codici
principali sono 400 per dati errati, 401 per sessione mancante, 403 per ambito
non autorizzato, 404 per entità non disponibile e 409 per conflitti/stato o
revisione non più attuali. Le transazioni annullano anche le risposte di errore.

## Organizzazioni e anagrafiche

| Metodo e percorso | Utilizzo |
| --- | --- |
| GET `/context` | Enti e appartenenze attive dell'operatore |
| POST `/organizations` | Attivazione ente sportivo autorizzato; registrazione di enti arbitrali riservata all’amministratore centrale |
| GET `/units?organizationId=…` | Strutture visibili nella gerarchia |
| POST `/units` | Sottostruttura con `parentId`, `name`, `kind`, `territory` |
| GET `/entities/:kind` | Elenchi di clubs, teams, people, officials, memberships, invitations, delegations, unavailability, imports |
| POST `/clubs`, `/teams`, `/officials` | Censimento/aggiornamento tramite codice esterno stabile |
| POST `/people/:id/status` | `active`, `suspended` o `ended` |
| POST `/squad-members` | Assegnazione di un tesseramento a una squadra |
| GET `/squads/:teamId` | Rosa paginata della squadra |
| POST `/squad-members/:id/revoke` | Rimozione dalla rosa senza eliminare persona o tesseramento |
| GET `/match-roster/:matchId?clubId=…` | Rosa operativa per la distinta; `null` per gare preesistenti non organizzative |

`clubs` preserva la società fra stagioni; `teams` usa codice e stagione.
L'identità della persona usa ente, tipo e codice federale; i tesseramenti
aggiungono società e stagione. I collegamenti espliciti con gli UUID storici
non sono dedotti dai nomi.

## Campionati, deleghe, calendario e designazioni

| Metodo e percorso | Utilizzo |
| --- | --- |
| GET/POST `/competitions` | Campionati per struttura, disciplina/stagione/categoria/girone e regole |
| GET `/competitions/:id` | Dettaglio autorizzato |
| GET `/competitions/:id/eligible-teams` | Squadre dell'ente compatibili per sport/stagione, anche di altre sue sottostrutture; richiede gestione campionato |
| GET `/competitions/:id/entries` | Squadre iscritte |
| POST `/entries` | Iscrizione con `competitionId`, `teamId` |
| GET `/directory`, `/directory/:id/units` | Soli metadati delle controparti per concedere una delega, da amministratore autorizzato |
| POST `/delegations` | Competizione, struttura destinataria, scadenza e permesso di designare |
| POST `/delegations/:id/revoke` | Revoca immediata della delega |
| GET/POST `/fixtures` | Calendario del campionato |
| POST `/fixtures/:id/change` | Revisione calendario, motivazione e riconferma incarichi |
| GET/POST `/appointments` | Designazioni; le letture delegate sono limitate alla struttura selezionata |
| POST `/appointments/:id/change` | `send`, `accept`, `decline`, `revoke` |
| GET `/my-appointments`, `/my-officials` | Incarichi e anagrafiche del titolare |
| POST `/unavailability` | Intervallo di indisponibilità |
| GET `/notifications` | Comunicazioni del titolare, persistenti e paginate |
| POST `/notifications/:id/read` | Lettura di una propria comunicazione |

Le designazioni memorizzano la delega utilizzata. Non si può combinare una
delega per la sezione A con un arbitro della sezione B. Revoche, scadenze,
appartenenza dell'arbitro e revisione della gara vengono ricontrollate quando
l'incarico viene usato, anche negli endpoint legacy.

## Inviti

`POST /invitations` richiede nome, ruolo e ambito; email facoltativa,
`officialId` per arbitri e `clubId` per dirigenti. La risposta contiene il
codice personale e il percorso con token nel frammento `/activate#…`.
Il database conserva soltanto l'hash del token; gli elenchi non lo espongono.

`POST /activate` riceve `{token,password}`. La chiamata prenota il token in una
breve transazione, esegue il provisioning fuori dal lock DB e conclude in una
nuova transazione che ricontrolla la prenotazione. La prenotazione dura 90
secondi e limita i tentativi. La risposta indica anche se occorre verificare
l'indirizzo email. Nessuna password provider viene memorizzata nel profilo.

`POST /invitations/:id/revoke` revoca gli inviti non consumati; per accessi già
attivati usare `/memberships/:id/revoke`. `/officials/:id/recover` genera un
invito breve di recupero dopo verifica umana dell'identità.

## Importazioni

1. `GET /import-models` restituisce le colonne obbligatorie per tipo.
2. `POST /imports/upload` riceve ambito, tipo, eventuale campionato, nome file,
   dimensione e SHA-256. Restituisce URL firmato privato e metodo di upload.
3. Caricare i byte direttamente allo Storage. Il fallback base64 è esclusivo
   del runtime locale; non viene accettato per bypassare lo Storage cloud.
4. `POST /imports/prepare` riceve `uploadId` e `mapping` facoltativa. Restituisce
   il lavoro oppure le colonne da mappare. Il contenuto viene normalizzato in
   blocchi privati; non viene ancora applicato alle anagrafiche.
5. `POST /imports/:id/advance` con `action:'advance'` valida il blocco successivo
   (100 righe). Dopo la validazione completa lo stato è `preview`.
6. `GET /imports/:id/rows` espone righe/esiti paginati. Con zero errori,
   `action:'commit'` autorizza l'applicazione; successive chiamate `advance`
   applicano ciascun blocco e salvano il checkpoint atomicamente.
7. `GET /imports/:id` e `/entities/imports` permettono di riprendere il lavoro.
   `action:'cancel'` è ammessa solo prima del primo blocco applicato.

Identificativo del lavoro: ente, unità, tipo, campionato e hash file. La
ripetizione non crea un secondo lavoro. Le competenze vengono ricontrollate
nella transazione dopo la lettura dello Storage, così una revoca intervenuta
nel frattempo impedisce la scrittura.

## Aggiornamenti gara

`GET /match-game/:matchId` collega una gara legacy alla sua fixture, se esiste.
`GET /games/:fixtureId` restituisce contesto, elenco giocatori, eventi,
riepilogo e referto.

`POST /games/:fixtureId/periods` riceve `operationId`, `revision`, `period`,
`events`, `homeScore`, `awayScore`, `state` e `correctionReason` facoltativa.
Ogni evento ha UUID, periodo, tipo, società, tesseramento interessato,
eventuale entrante, minuto, recupero e punti. Gli eventi sono cumulativi;
il backend deriva e verifica il punteggio. L'operazione ripetuta con lo stesso
contenuto non produce nuovi eventi. Un identificativo riutilizzato con dati
diversi o una revisione superata viene rifiutato.

Gli stati sono `provisional`, `period_confirmed`, `final_confirmed`.
`POST /games/:id/report` invia il referto del principale dopo il risultato
finale; `POST /games/:id/homologate` registra l'omologazione da parte della
struttura competente dopo l'invio del referto. La cronologia dei periodi è
immutabile; il riepilogo corrente conserva l'ultima revisione. Il referto
inviato non viene riaperto automaticamente da un altro aggiornamento.

Il catalogo `/directory` presenta soltanto enti arbitrali già registrati. Una delega non crea appartenenze amministrative all’ente destinatario né concede accesso ai referti.

`GET /api/v1/public/sports` restituisce il catalogo unico delle discipline (`id`, `name`, `group`, `detailedResults`). È pubblico e non contiene dati di persone, gare o referti. `detailedResults` indica la disponibilità del regolamento operativo, non l'autorizzazione alla pubblicazione di una competizione.
