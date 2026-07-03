# RefCheckID — Handover Package Binario B Mobile

> Documento operativo per Codex Ref Mobile. Il team Mobile ha pieno accesso alla repository RefCheckID, ai sorgenti Web, Backend, documentazione, test e fixture: quando un comportamento non è descritto qui con sufficiente dettaglio, deve essere replicato verificando direttamente i file indicati, senza alterare le regole di business.

## 1. Scopo del package

Questo handover consente di replicare il portale Web RefCheckID in applicazione mobile con Feature Parity. Non è una brochure: è la mappa tecnica, funzionale e architetturale delle aree Web attualmente implementate.

Obiettivo mobile:
- mantenere identici ruoli, workflow, stati, validazioni, permessi, API e regole di dominio;
- adattare solo layout, navigazione e micro-interazioni al formato mobile;
- non modificare contratti API, semantica degli stati o logiche di approvazione;
- usare questo documento come checklist di accettazione.

## 2. Architettura Web da replicare

### 2.1 Stack e runtime

- Frontend: Next.js App Router con componenti client React.
- Stato server/cache: TanStack React Query.
- Stato sessione: React Context più `localStorage` key `refcheckid.session`.
- UI: componenti condivisi `Button`, `Card`, `Input`, `ErrorBoundary`, `SkeletonBlock`, `EmptyState`, `ErrorState`, `ToastProvider`.
- API: fetch REST verso backend configurato da `NEXT_PUBLIC_API_BASE_URL` o fallback locale.
- Dati demo/pilota: fallback locali e snapshot `localStorage` per distinte, referti e richieste foto.

### 2.2 Bootstrap applicativo

1. `RootLayout` monta shell HTML, font/classi globali e `Providers`.
2. `Providers` monta `QueryClientProvider`, `SessionProvider`, `ToastProvider` ed `ErrorBoundary`.
3. Ogni pagina protetta usa `AuthGate`.
4. `AuthGate` attende `isReady`, legge sessione, redirige se assente o se il ruolo non coincide, mostra barra utente e logout.
5. Tutte le API passano da `request`, che risolve sessione valida, fa refresh se scaduta e aggiunge `Authorization: Bearer <accessToken>`.

### 2.3 Ruoli

- `manager`: dirigente/club. Gestisce dashboard società, distinta, convocati, staff, foto tesserati.
- `referee`: arbitro. Verifica distinte, avvia riconoscimento, approva/rifiuta soggetti, compila e invia referto.
- `federation`: federazione. Monitora dashboard, calendario, referti, richieste foto, storico/audit.

### 2.4 Route Web principali

| Route | Ruolo | Scopo | File principale |
|---|---|---|---|
| `/` | pubblico/session-aware | login e redirect per ruolo già autenticato | `refcheckid-web/src/app/page.tsx` |
| `/manager` | manager | dashboard dirigente | `refcheckid-web/src/app/manager/page.tsx` |
| `/manager/match-sheet` | manager | workflow distinta | `refcheckid-web/src/app/manager/match-sheet/page.tsx`, `features/manager/match-sheet-workflow.tsx` |
| `/referee` | referee | dashboard arbitro | `refcheckid-web/src/app/referee/page.tsx` |
| `/referee/match` | referee | workflow gara arbitro | `refcheckid-web/src/app/referee/match/page.tsx`, `features/referee/referee-match-workflow.tsx` |
| `/federation` | federation | cruscotto operativo federazione | `refcheckid-web/src/app/federation/page.tsx`, `features/federation/federation-workflow.tsx` |

## 3. Contratti API e servizi frontend

### 3.1 Auth

Servizio Web: `refcheckid-web/src/lib/auth-client.ts`.

API:
- `POST /auth/login` con credenziali, ritorna `AppSession`.
- `POST /auth/refresh` con `refreshToken`, ritorna nuova `AppSession` o fallisce.
- `POST /auth/logout` con refresh token, invalida sessione lato server.

Regole:
- sessione valida solo con `accessToken`, `refreshToken`, `expiresAt`, `user.id`, `user.email`, `user.role`;
- se scaduta, tentare refresh prima della request;
- se refresh fallisce, rimuovere sessione e tornare al login;
- ruoli validi: `manager`, `referee`, `federation`.

### 3.2 API base comuni

Servizio Web: `refcheckid-web/src/lib/api-client.ts`.

Endpoint usati:
- `GET /matches[?clubId=...]`
- `GET /match-sheets[?clubId=...|?matchId=...]`
- `POST /match-sheets/{id}/submit`
- `POST /match-sheets/{id}/lock`
- `POST /match-sheets/{id}/reset-smoke`
- `GET /match-reports[?matchId=...]`
- `PATCH /match-reports/{id}` con `{ summary }`
- `POST /match-reports/{id}/submit`
- `GET /players`
- `GET /staff-members`
- `GET /photos`
- `POST /recognitions/start` con `{ matchId }`
- `POST /recognitions/complete` con `{ matchId }`
- `GET /audit/by-action?action=MATCH_ARCHIVED`

Eccezioni comuni:
- ogni response non OK genera errore `API request failed with status <status>`;
- `204` ritorna `undefined`;
- UI deve mostrare stato errore con retry dove esiste `useQuery`.

### 3.3 Query keys

Replicare chiavi/cache concettuali: `manager`, `players`, `staff`, `matchSheets`, `matches`, `matchReports`, `photos`, `recognitions`, `referees`, `federation`, `audit`.

## 4. Modelli dati fondamentali

### 4.1 Sessione

```ts
type AppRole = "manager" | "referee" | "federation";
interface AppSession { accessToken: string; refreshToken: string; expiresAt: string; user: { id: string; email: string; role: AppRole; displayName: string } }
```

### 4.2 Distinta manager

- `MatchSheetStatus`: `draft | submitted | locked`.
- `PlayerLineupRole`: `starter | reserve`.
- `PlayerListItem`: id, nome, cognome, foto, warning, suspended, selected, shirtNumber, role, isGoalkeeper, isCaptain, isViceCaptain.
- `StaffListItem`: id, fullName, role, photoUrl, selected.

### 4.3 Arbitro

- `RefereeMatchStatus`: `scheduled | sheets_locked | recognition | completed | reported`.
- `SheetVerificationStatus`: `locked | submitted | missing`.
- `RecognitionDecision`: `pending | approved | rejected`.
- `RecognitionSubject`: soggetto player/staff con foto, documento, squadra, ruolo e decisione.
- `MatchReportDraft`: risultato, eventi gol/ammonizioni/espulsioni/sostituzioni, note arbitro.

### 4.4 Federazione

- `FederationMatchStatus`: `scheduled | in_progress | completed | archived`.
- `FederationReportStatus`: `missing | draft | submitted | reviewed`.
- `PhotoRequestStatus`: `pending | approved | rejected`.
- `FederationDashboard`, `FederationMatchListItem`, `FederationReport`, `PhotoRequest`, `FederationHistoryItem`.

## 5. Pagine e schermate

### 5.1 Login `/`

**Cosa fa:** autentica l’utente e redirige al portale di ruolo. Se una sessione esiste già, non mostra scelta manuale ma redirige automaticamente.

**Perché esiste:** ingresso unico multi-ruolo.

**Ruoli:** pubblico prima del login; dopo login tutti i ruoli.

**Layout Web:** main full-screen, background muted, form centrato.

**Componenti:** `LoginForm`, `Input`, `Button`, `useSession`, `useRouter`.

**Servizi/API:** `loginWithPassword` verso `/auth/login`; `roleRedirects` per routing.

**Stati:** idle, submitting, errore credenziali/API, redirect.

**Validazioni:** campi email/password richiesti dal form; sessione ricevuta deve essere valida.

**Azioni:** submit login, salvataggio sessione, redirect a `/manager`, `/referee` o `/federation`.

**Errori:** messaggio API di login; sessione invalida non deve essere accettata.

**Loading:** bottone/form in stato submit.

**Permessi:** nessuno in ingresso; redirect su ruolo sessione.

**Test esistenti:** `tests/unit/auth-client.test.ts`, `tests/unit/api-base-url.test.ts`, integrazione frontend contract.

### 5.2 Manager Dashboard `/manager`

**Cosa fa:** mostra al dirigente prossima gara, stato distinta e notifiche; consente accesso alla distinta.

**Perché esiste:** landing operativa del club prima dell’invio distinta.

**Ruolo:** solo `manager`.

**Layout:** header con “Area Dirigente”, titolo Dashboard, CTA “Apri distinta”; griglia 3 card.

**Componenti:** `AuthGate`, `Card`, `EmptyState`, `ErrorState`, `SkeletonBlock`, `Link`.

**Hook:** `useQuery(fetchManagerDashboard)`.

**API:** `GET /matches?clubId=<club>`, `GET /match-sheets?clubId=<club>`.

**Regole business:** prossima gara = prima per `scheduledAt`; stato distinta visualizzato come bozza/inviata/locked; notifiche derivate dallo stato.

**Validazioni:** dati dashboard null -> empty state.

**Eccezioni:** errore query con retry.

**Stati:** loading skeleton; errore retry; empty; dati.

**Pulsanti:** “Apri distinta” naviga a `/manager/match-sheet`; logout in `AuthGate`.

**Test:** `manager-team-source`, `api-client`, integrazione Web.

### 5.3 Manager Distinta `/manager/match-sheet`

**Cosa fa:** wizard per convocare giocatori e staff, assegnare numeri/ruoli, caricare foto, verificare regole e inviare distinta.

**Perché esiste:** digitalizza la distinta gara prima del riconoscimento arbitrale.

**Ruolo:** solo `manager`.

**File:** `src/app/manager/match-sheet/page.tsx`, `src/features/manager/match-sheet-workflow.tsx`.

**Layout:** wizard a step con contenuto card; ricerca giocatori; liste selezionabili; riepilogo/validazioni; azioni submit/reset.

**Componenti:** `DndContext`, `SortableContext`, card soggetto, upload foto, controlli numero maglia/ruolo/capitano/vice/portiere, `Button`, `Input`, `Toast`.

**Hook/store:** `useState`, `useMemo`, `useQuery`, `useMutation`, `useQueryClient`, `useToast`; `manager-photo-store`; `submitted-match-sheet` local snapshot.

**API:** `GET /players`, `GET /staff-members`, `GET /match-sheets?clubId=...`, `POST /match-sheets/{id}/submit`, `POST /match-sheets/{id}/reset-smoke`.

**Regole business distinta:**
- invio permesso solo se la prima distinta è `draft`;
- se stato diverso da `draft`, UI read-only e mutazioni locali ignorate;
- almeno 1 giocatore convocato;
- almeno 1 membro staff;
- ogni giocatore convocato deve avere numero maglia;
- numeri maglia non duplicati;
- giocatori `suspended` non selezionabili/validi;
- esattamente 11 titolari;
- esattamente 1 portiere tra i titolari;
- massimo 20 riserve;
- massimo 5 staff;
- massimo 1 capitano e 1 vice;
- capitano e vice devono essere titolari;
- capitano e vice devono essere persone diverse;
- disattivando un giocatore si rimuovono capitano/vice.

**Validazioni upload foto:**
- file obbligatoriamente immagine (`type.startsWith("image/")`);
- dimensione massima 5 MB;
- preview obbligatoria prima del salvataggio;
- crop/zoom/offset applicati prima di salvare.

**Workflow foto manager:**
- se il soggetto non ha foto corrente, nuova foto approvata localmente e sostituisce subito la foto;
- se il soggetto ha già foto, la nuova foto diventa richiesta `pending` per Federazione;
- fino all’approvazione, il manager continua a usare la foto attuale “a suo rischio” nel riconoscimento;
- Federazione può approvare o rifiutare dal pannello Foto.

**Eccezioni:** nessuna distinta disponibile; distinta già inviata; errori API; foto non valida; preview non confermata.

**Stati:** loading dati; errore con retry; distinta draft editabile; submitted/locked readonly; toast success/error; photo draft/error.

**Pulsanti/azioni:** seleziona/deseleziona giocatore/staff, imposta numero, ruolo titolare/riserva, portiere, capitano, vice, drag reorder, scegli file, conferma foto, invia distinta, ripristina distinta prova.

**Test:** `match-sheet-validation.test.ts`, `manager-photo-store.test.ts`, `manager-photo-source.test.ts`, `manager-team-source.test.ts`, `api-client.test.ts`, integrazione frontend.

### 5.4 Referee Dashboard `/referee`

**Cosa fa:** mostra prossima gara assegnata e link al workflow gara.

**Perché esiste:** landing arbitro pre-gara.

**Ruolo:** solo `referee`.

**Componenti:** `AuthGate`, `Card`, stati UI, link a `/referee/match`.

**API:** `GET /matches` tramite `fetchRefereeDashboard`.

**Regole:** prossima gara = prima per `scheduledAt`; notifica stato gara `scheduled`, `in_progress`, `completed`.

**Stati:** loading, errore retry, empty nessuna gara, dati.

### 5.5 Referee Match Workflow `/referee/match`

**Cosa fa:** workflow arbitrale completo: verifica distinte, riconoscimento soggetti, referto gara.

**Perché esiste:** sostituisce controllo cartaceo e referto manuale.

**Ruolo:** solo `referee`.

**File:** `src/app/referee/match/page.tsx`, `src/features/referee/referee-match-workflow.tsx`.

**Layout:** sidebar step `Distinte`, `Riconoscimento`, `Referto`; contenuto card per step. Su mobile replicare con tabs/stepper orizzontale o bottom segmented control.

**Hook/store:** `useSession`, `useQuery`, `useMutation`, stato locale step, recognitionClosed, fullRecognitionComplete; snapshot referto in `submitted-report`.

**API:** `GET /matches`, `GET /match-sheets?matchId=...`, `POST /match-sheets/{id}/lock`, `POST /recognitions/start`, `GET /match-sheets`, `POST /recognitions/complete`, `GET /match-reports?matchId=...`, `PATCH /match-reports/{id}`, `POST /match-reports/{id}/submit`.

#### Step Distinte

- Mostra card casa/ospite con stato, conteggio giocatori/staff, data invio.
- Stato `submitted` = da prendere in carico; `locked` = pronta; `draft` lato API viene mappato a `missing`.
- Se una distinta è mancante, mostra errore “Distinta ospite mancante”.
- `Inizia riconoscimento` è abilitato solo se tutte le distinte non sono `missing`.
- Default: iniziare dalla squadra di casa, ma Web consente selezione squadra prima dell’avvio.
- Azione: lock di tutte le distinte submitted e start recognition.

#### Step Riconoscimento

- Carica soggetti da snapshot distinte submitted/locked o fallback pilota.
- Mostra foto, nome, squadra, ruolo, numero, documento.
- Ogni soggetto parte `pending`.
- Arbitro può `approved` o `rejected` per ciascun soggetto.
- Completamento consentito solo quando tutti i soggetti non sono pending.
- Al completamento chiama `/recognitions/complete`, chiude riconoscimento e blocca ritorno agli step precedenti.

#### Step Referto

Sotto-step: `Risultato`, `Gol`, `Ammonizioni`, `Espulsioni`, `Sostituzioni`, `Note`, `Riepilogo`.

Campi:
- risultato casa/ospite;
- eventi con minuto, squadra, numero maglia, giocatore risolto, dettaglio;
- note arbitro;
- riepilogo errori/validazioni;
- submit finale.

**Regole referto:**
- il referto non deve essere inviabile finché il riconoscimento completo non è terminato;
- minuti interi tra 1 e 120;
- eventi in ordine cronologico per sezione;
- squadra obbligatoria (`Casa` o `Ospite`);
- gol/ammonizioni/espulsioni richiedono numero maglia;
- il giocatore deve esistere nella distinta della squadra;
- nome giocatore coerente con squadra e maglia;
- conteggio eventi gol deve coincidere con risultato finale;
- numero eventi gol non superiore a totale risultato;
- una riserva non può avere eventi prima di entrare;
- un giocatore non può avere eventi prima dell’ingresso o dopo uscita/espulsione;
- un espulso non può essere sostituito dopo l’espulsione;
- una uscita/espulsione deve avvenire dopo l’ultimo evento attivo del giocatore.

**Eccezioni:** sessione assente, nessuna gara assegnata, errori API, distinte mancanti, riconoscimento incompleto, validazioni referto.

**Test:** `referee-report-validation.test.ts`, `referee-api-client.test.ts`, `referee-workflow-source.test.ts`, integrazione flow.

### 5.6 Federation `/federation`

**Cosa fa:** cruscotto operativo federale con dashboard, calendario, referti, richieste foto, storico.

**Perché esiste:** controllo e supervisione post-gara e governance foto/archivio.

**Ruolo:** solo `federation`.

**File:** `src/app/federation/page.tsx`, `src/features/federation/federation-workflow.tsx`.

**Layout:** sidebar sezioni `Cruscotto`, `Calendario`, `Referti`, `Foto`, `Storico`; su mobile usare tabs/accordion mantenendo stesso ordine e contenuto.

**Hook/store:** `useQuery`, `useQueryClient`, `useMemo`, `useState`, `useToast`; `manager-photo-store`, `submitted-report`.

#### Cruscotto

- KPI: referti ricevuti, gare in attesa, richieste foto pending.
- Notifiche operative derivate dagli stessi conteggi.
- API: `fetchFederationReports`, `fetchPhotoRequests`, `fetchFederationMatches`.
- Stati: skeleton, errore retry, empty dashboard, dati.

#### Calendario

- Lista gare con giornata, squadre, arbitro, stato gara, stato referto.
- Filtri: giornata (`all` o giorno UTC da `scheduledAt`), stato referto (`all`, `missing`, `draft`, `submitted`, `reviewed`).
- Stati gara normalizzati: `completed`, `in_progress`, altrimenti `scheduled`.
- Referto normalizzato: `submitted/reviewed/draft`, altrimenti `missing`.

#### Referti

- Lista referti ricevuti e dettaglio selezionato.
- Dettaglio: squadre, arbitro, risultato, note, gol, ammonizioni, espulsioni, sostituzioni, eventuali note commissario.
- Fonti: referti salvati localmente dal workflow arbitro più backend `submitted` non duplicati.

#### Foto

- Lista richieste foto da backend `/photos` più richieste locali manager.
- Stati: `pending`, `approved`, `rejected`.
- Azioni: approva/rifiuta tramite `decideManagerPhotoApprovalRequest` per richieste locali.
- Regola: approvazione applica override foto; rifiuto mantiene foto corrente.

#### Storico

- Mostra storico referti locali inviati e audit backend `MATCH_ARCHIVED`.
- Ogni riga include gara, società, arbitro, report id e summary audit.

**Eccezioni:** errori API con retry; nessuna gara filtrata; nessun referto; nessuna foto; nessuno storico.

**Test:** `federation-api-client.test.ts`, `federation-workflow-source.test.ts`, integrazione frontend.

## 6. Workflow end-to-end

### 6.1 Login

1. Utente apre app.
2. App legge sessione persistita.
3. Se sessione valida: redirect alla home ruolo.
4. Se sessione scaduta: refresh automatico alla prima API; se fallisce logout.
5. Se non autenticato: mostra form.
6. Submit credenziali a `/auth/login`.
7. Salva `AppSession`.
8. Redirect: manager `/manager`, referee `/referee`, federation `/federation`.

### 6.2 Bootstrap dati

1. Ogni area protetta attende `AuthGate`.
2. Query principali partono solo dopo sessione o contesto richiesto.
3. In loading mostra skeleton, non UI parziale mutabile.
4. In errore mostra `ErrorState` con retry.
5. Se risposta vuota/null mostra empty state dedicato.

### 6.3 Gestione campionati/gare

1. Federazione usa calendario come vista operativa gare.
2. Manager e arbitro usano la “prossima gara” ordinata per `scheduledAt`.
3. Stato gara viene normalizzato per UI.
4. Stato referto deriva da report backend/locali.
5. Mobile non deve introdurre nuove transizioni gara non previste.

### 6.4 Gestione distinte

1. Manager apre distinta.
2. Carica roster giocatori/staff e distinta draft.
3. Se draft: seleziona convocati/staff, numeri, ruoli, portiere, capitano/vice.
4. App valida in tempo reale.
5. Se valida: salva snapshot e chiama submit.
6. Distinta passa `submitted`.
7. Arbitro la prende in carico e la blocca (`locked`) prima del riconoscimento.
8. Manager in submitted/locked vede read-only.

### 6.5 Workflow upload foto

1. Manager seleziona immagine.
2. App valida MIME e dimensione.
3. App mostra preview con crop/zoom/offset.
4. Manager conferma.
5. Se nessuna foto precedente: applicazione immediata.
6. Se foto precedente presente: richiesta pending a Federazione.
7. Federazione approva o rifiuta.
8. Approva = nuova foto effettiva; rifiuta = foto corrente invariata.

### 6.6 Workflow approvazione federazione

1. Federazione apre Foto.
2. Vede tutte le richieste pending/approved/rejected.
3. Per pending locale può approvare o rifiutare.
4. L’azione aggiorna store e UI, con toast.
5. Audit/storico restano separati dal flusso foto salvo backend futuro.

### 6.7 Workflow riconoscimento arbitrale

1. Arbitro verifica entrambe le distinte.
2. Se mancano distinte, non può iniziare.
3. Avvio: lock distinte submitted e start recognition.
4. App mostra soggetti di entrambe le distinte.
5. Arbitro decide ogni soggetto: approvato o rifiutato.
6. Finché esiste pending, workflow non è completo.
7. Complete recognition chiude step precedenti e abilita referto.

### 6.8 Workflow referto

1. Arbitro inserisce risultato.
2. Inserisce eventi per sezione.
3. App risolve nomi da squadra+numero e valida coerenza.
4. App verifica cronologia e partecipazione.
5. Riepilogo mostra errori se presenti.
6. Submit serializza summary JSON, fa PATCH report e poi submit.
7. Salva copia locale per dashboard Federazione.

### 6.9 Workflow audit/storico

1. Federazione legge referti locali inviati.
2. Legge audit backend `MATCH_ARCHIVED`.
3. Combina record in lista storico.
4. Nessuna modifica da mobile: storico è consultivo.

## 7. Feature Parity Checklist Mobile

### 7.1 Core e sessione

- [ ] App bootstrap con provider equivalenti.
- [ ] Persistenza sessione sicura equivalente a `refcheckid.session`.
- [ ] Login con `/auth/login`.
- [ ] Refresh token automatico con `/auth/refresh`.
- [ ] Logout con `/auth/logout`.
- [ ] Redirect per ruolo.
- [ ] Guard per schermate protette.
- [ ] Stato “Verifica sessione”.
- [ ] Gestione API 401/refresh fallito.
- [ ] Error boundary o fallback crash.
- [ ] Toast success/error.
- [ ] Skeleton loading.
- [ ] Empty state.
- [ ] Error state con retry.

### 7.2 Manager

- [ ] Dashboard dirigente.
- [ ] Prossima gara ordinata per data.
- [ ] Stato distinta formattato.
- [ ] Notifiche stato distinta.
- [ ] Navigazione ad apertura distinta.
- [ ] Caricamento giocatori da `/players` con fallback.
- [ ] Caricamento staff da `/staff-members` con fallback.
- [ ] Caricamento distinta club.
- [ ] Ricerca giocatori per cognome/nome.
- [ ] Selezione/deselezione giocatore.
- [ ] Blocco selezione sospesi.
- [ ] Selezione/deselezione staff.
- [ ] Numero maglia per convocato.
- [ ] Ruolo titolare/riserva.
- [ ] Flag portiere.
- [ ] Flag capitano.
- [ ] Flag vice capitano.
- [ ] Reset capitano/vice su deselezione.
- [ ] Riordino convocati equivalente al drag Web o UX mobile alternativa.
- [ ] Validazione almeno un giocatore.
- [ ] Validazione almeno uno staff.
- [ ] Validazione numeri mancanti.
- [ ] Validazione numeri duplicati.
- [ ] Validazione sospesi non validi.
- [ ] Validazione 11 titolari.
- [ ] Validazione 1 portiere titolare.
- [ ] Validazione massimo 20 riserve.
- [ ] Validazione massimo 5 staff.
- [ ] Validazione un capitano.
- [ ] Validazione capitano titolare.
- [ ] Validazione un vice.
- [ ] Validazione vice titolare.
- [ ] Validazione capitano/vice diversi.
- [ ] Upload foto immagine soltanto.
- [ ] Upload foto massimo 5 MB.
- [ ] Preview/crop/zoom/offset.
- [ ] Conferma preview obbligatoria.
- [ ] Foto immediata se non esiste foto corrente.
- [ ] Richiesta pending se foto corrente esiste.
- [ ] Toast invio foto approvazione.
- [ ] Submit distinta solo se draft e valida.
- [ ] Snapshot distinta inviato.
- [ ] Stato readonly per submitted/locked.
- [ ] Reset distinta prova se mantenuto in mobile di test.

### 7.3 Arbitro

- [ ] Dashboard arbitro.
- [ ] Prossima gara ordinata per data.
- [ ] Notifica stato gara.
- [ ] Workflow step Distinte/Riconoscimento/Referto.
- [ ] Verifica sessione richiesta.
- [ ] Empty nessuna gara assegnata.
- [ ] Caricamento distinte per match.
- [ ] Card distinta casa/ospite.
- [ ] Conteggio giocatori/staff.
- [ ] Stato submitted/locked/missing.
- [ ] Alert distinta ospite mancante.
- [ ] Selezione squadra iniziale.
- [ ] Start recognition disabilitato se missing.
- [ ] Lock distinte submitted.
- [ ] Start recognition API.
- [ ] Caricamento soggetti riconoscimento.
- [ ] Visualizzazione foto/documento/ruolo/squadra/numero.
- [ ] Decisione approvato.
- [ ] Decisione rifiutato.
- [ ] Pending per default.
- [ ] Complete recognition solo senza pending.
- [ ] Complete recognition API.
- [ ] Blocco ritorno a step precedenti dopo chiusura.
- [ ] Referto disabilitato finché riconoscimento incompleto.
- [ ] Sotto-step Risultato.
- [ ] Sotto-step Gol.
- [ ] Sotto-step Ammonizioni.
- [ ] Sotto-step Espulsioni.
- [ ] Sotto-step Sostituzioni.
- [ ] Sotto-step Note.
- [ ] Sotto-step Riepilogo.
- [ ] Validazione risultato vs gol.
- [ ] Validazione minuto 1-120.
- [ ] Validazione cronologia eventi.
- [ ] Validazione squadra obbligatoria.
- [ ] Validazione numero maglia obbligatorio per eventi primari.
- [ ] Validazione tesserato presente in distinta.
- [ ] Validazione nome coerente.
- [ ] Validazione riserva entrata prima di eventi.
- [ ] Validazione espulso non sostituibile dopo espulsione.
- [ ] Validazione nessun evento dopo uscita/espulsione.
- [ ] Submit referto PATCH + POST submit.
- [ ] Salvataggio copia referto per Federazione.

### 7.4 Federazione

- [ ] Auth guard federation.
- [ ] Navigazione sezioni in ordine Web.
- [ ] Cruscotto KPI referti ricevuti.
- [ ] Cruscotto KPI gare in attesa.
- [ ] Cruscotto KPI richieste foto.
- [ ] Notifiche operative.
- [ ] Calendario gare.
- [ ] Filtro giornata.
- [ ] Filtro stato referto.
- [ ] Badge stato gara.
- [ ] Badge stato referto.
- [ ] Empty nessuna gara filtrata.
- [ ] Lista referti ricevuti.
- [ ] Dettaglio referto.
- [ ] Risultato referto.
- [ ] Note arbitro.
- [ ] Gol referto.
- [ ] Ammonizioni referto.
- [ ] Espulsioni referto.
- [ ] Sostituzioni referto.
- [ ] Lista richieste foto.
- [ ] Stato foto pending/approved/rejected.
- [ ] Foto corrente e proposta.
- [ ] Approva foto.
- [ ] Rifiuta foto.
- [ ] Applicazione override su approvazione.
- [ ] Storico referti locali.
- [ ] Storico audit `MATCH_ARCHIVED`.
- [ ] Error/retry per ogni query.

### 7.5 Test parity

- [ ] Unit test validazioni distinta portate in mobile.
- [ ] Unit test validazioni referto portate in mobile.
- [ ] Test auth client mobile.
- [ ] Test API client mobile.
- [ ] Test source/workflow per manager.
- [ ] Test source/workflow per arbitro.
- [ ] Test source/workflow per federazione.
- [ ] Test happy path end-to-end: manager submit -> arbitro recognition/referto -> federazione vede referto.

## 8. Test Web esistenti da consultare

- Frontend unit: `refcheckid-web/tests/unit/*.test.ts`.
- Frontend integration: `refcheckid-web/tests/integration/frontend-contract.test.ts`, `refcheckid-web/tests/web-integration.test.ts`.
- Backend/service/e2e: `refcheckid-backend/tests/**/*.test.ts`.
- Test critici per mobile: `match-sheet-validation`, `referee-report-validation`, `auth-client`, `api-client`, `federation-api-client`, `referee-api-client`, `manager-photo-store`.

## 9. Indicazioni per Codex Ref Mobile

### 9.1 Cosa deve replicare

Codex Ref Mobile deve replicare integralmente:
- i tre ruoli e le loro autorizzazioni;
- login, refresh, logout e redirect per ruolo;
- dashboard manager, arbitro, federazione;
- workflow distinta con tutte le validazioni;
- workflow upload foto e approvazione federale;
- workflow verifica distinte e riconoscimento arbitrale;
- workflow referto e validazioni cronologiche;
- calendario, referti, foto e storico federazione;
- contratti API, query, modelli dati e stati.

### 9.2 Cosa NON deve modificare

Non modificare:
- endpoint REST;
- significato degli stati `draft`, `submitted`, `locked`, `missing`, `pending`, `approved`, `rejected`, `reviewed`;
- ruoli e redirect logici;
- regole di validazione distinta;
- regole di validazione referto;
- sequenza lock distinte -> start recognition -> complete recognition -> submit report;
- logica pending foto quando esiste foto corrente;
- mapping dei dati verso Federazione.

### 9.3 Regole di business intoccabili

Sono intoccabili:
- distinta editabile solo in `draft`;
- riconoscimento avviabile solo con distinte non mancanti;
- referto inviabile solo dopo riconoscimento completo;
- ogni soggetto riconoscimento deve essere deciso;
- risultato e gol devono coincidere;
- eventi devono rispettare cronologia e presenza in campo;
- capitano/vice e portiere/titolari devono rispettare validazioni Web;
- foto esistente sostituibile solo dopo approvazione Federazione.

### 9.4 Cosa può adattare per UX mobile

Può adattare:
- sidebar in tab bar, segmented control o stepper;
- drag-and-drop in pulsanti su/giù o reorder list nativa;
- card dense in accordion;
- tabelle in liste responsive;
- upload foto usando camera/gallery nativa;
- toast in snackbar mobile;
- layout a una colonna;
- filtri come bottom sheet.

### 9.5 Cosa deve rimanere identico al Web

Deve rimanere identico:
- nomi funzionali degli step;
- ordine dei workflow;
- messaggi di errore business principali;
- condizioni di abilitazione/disabilitazione azioni;
- payload e interpretazione API;
- validazioni;
- stati loading/error/empty;
- output visibile delle decisioni e dei badge.

### 9.6 Accesso repository

Il team Mobile/Codex Ref Mobile ha pieno accesso alla repository e a tutti i file del progetto RefCheckID. Deve usare i file Web come fonte di verità implementativa quando servono dettagli UI o casi limite, e deve usare i test esistenti come specifica eseguibile da portare nel progetto mobile.
