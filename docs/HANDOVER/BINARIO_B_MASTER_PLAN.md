# RefCheckID — Binario B Master Plan Feature Parity Mobile

> Stato: Master Plan ufficiale per il Binario B.  
> Source of Truth: esclusivamente il portale Web `refcheckid-web` e i contratti backend usati dal Web.  
> Divieto operativo: questo piano non richiede e non autorizza modifiche al Client Mobile. Il Client Mobile non è fonte decisionale per le Wave.

## 1. Panoramica generale del progetto

RefCheckID digitalizza il ciclo operativo di una gara: società/dirigente prepara la distinta, arbitro prende in carico le distinte e riconosce i tesserati, arbitro compila il referto, federazione monitora calendario/referti/foto/storico. Il portale Web è la Source of Truth funzionale e tecnica per ottenere Feature Parity Mobile al 100%.

### 1.1 Principio di Feature Parity

Feature Parity significa che, al termine delle Wave, il Mobile deve offrire le stesse capacità funzionali del Web:

- stessi ruoli: `manager`, `referee`, `federation`;
- stessi gate autorizzativi e redirect logici;
- stessi workflow e ordine delle transizioni;
- stessi endpoint e interpretazione dei payload;
- stesse validazioni e regole di business;
- stessi stati applicativi: loading, error, empty, read-only, success, pending;
- stessi messaggi business principali;
- stessa semantica degli stati di dominio: `draft`, `submitted`, `locked`, `missing`, `pending`, `approved`, `rejected`, `reviewed`;
- stessa visibilità dati per ruolo.

Sono adattabili solo il layout, la navigazione e i pattern UX compatibili con mobile, senza cambiare comportamento.

### 1.2 Ambito analizzato nella Source of Truth Web

La pianificazione deriva da:

- App Router: `src/app/layout.tsx`, `src/app/providers.tsx`, `src/app/page.tsx`, pagine protette manager/referee/federation;
- componenti condivisi: `components/auth`, `components/ui`;
- feature modules: `features/manager`, `features/referee`, `features/federation`;
- librerie client: `lib/api-client`, `auth-client`, `session`, API specialistiche, tipi, validazioni, store localStorage, utility;
- test frontend unitari e integrazione;
- backend REST consumato dal Web e middleware/auth/service repository rilevanti per i contratti API.

### 1.3 Ruoli e responsabilità

| Ruolo | Responsabilità Web da replicare | Aree principali |
|---|---|---|
| `manager` | preparare distinta, convocare giocatori/staff, gestire foto, inviare distinta | `/manager`, `/manager/match-sheet` |
| `referee` | verificare distinte, bloccarle, riconoscere soggetti, compilare/inviare referto | `/referee`, `/referee/match` |
| `federation` | monitorare dashboard, calendario, referti, foto, storico/audit | `/federation` |

### 1.4 Ordine cronologico delle Wave

1. **Wave 0 — Governance, Source of Truth e matrice di copertura**
2. **Wave 1 — Fondazioni applicative, configurazione e design system minimo**
3. **Wave 2 — Sessione, autenticazione, autorizzazione e routing protetto**
4. **Wave 3 — API client, cache, error/loading/empty framework e contratti dati**
5. **Wave 4 — Dashboard Manager e contesto squadra**
6. **Wave 5 — Distinta Manager: roster, selezione, ruoli e validazioni core**
7. **Wave 6 — Distinta Manager: upload foto, richieste approvazione e submit lifecycle**
8. **Wave 7 — Dashboard Arbitro e verifica distinte**
9. **Wave 8 — Riconoscimento arbitrale completo**
10. **Wave 9 — Referto arbitrale completo**
11. **Wave 10 — Federazione: cruscotto e calendario**
12. **Wave 11 — Federazione: referti, foto, storico e audit**
13. **Wave 12 — Hardening finale, test end-to-end e certificazione 100% Feature Parity**

### 1.5 Regole di suddivisione

- Ogni funzionalità appartiene a una sola Wave.
- Ogni Wave è verificabile indipendentemente con criteri di completamento e test.
- Le dipendenze sono progressive: nessuna Wave richiede funzionalità di una Wave successiva.
- Le Wave infrastrutturali precedono quelle di ruolo.
- Le Wave di dominio seguono il ciclo gara Web: manager -> arbitro -> federazione.

## 2. Dipendenze tra le Wave

```text
Wave 0
  └─ Wave 1
      └─ Wave 2
          └─ Wave 3
              ├─ Wave 4
              │   └─ Wave 5
              │       └─ Wave 6
              ├─ Wave 7
              │   └─ Wave 8
              │       └─ Wave 9
              └─ Wave 10
                  └─ Wave 11
All role waves + all test assets └─ Wave 12
```

Dipendenze funzionali:

- Wave 1 abilita shell, provider, UI e utility base.
- Wave 2 abilita accesso protetto per tutte le aree.
- Wave 3 abilita chiamate API, cache, contratti e stati asincroni.
- Wave 4-6 completano il dominio Manager prima che l'Arbitro possa consumare distinte e snapshot.
- Wave 7-9 completano il dominio Arbitro prima che la Federazione possa vedere referti completi.
- Wave 10-11 completano il dominio Federation.
- Wave 12 certifica assenza di gap.

## 3. Catalogo completo delle funzionalità Web mappate alle Wave

| Area Web / Funzionalità | Wave proprietaria |
|---|---|
| Analisi Source of Truth, inventario route/file/test/API | Wave 0 |
| App bootstrap, layout root, provider shell | Wave 1 |
| UI primitives: Button, Card, Input, State, Toast, ErrorBoundary | Wave 1 |
| Config base URL e utility className | Wave 1 |
| Session storage, login, refresh, logout | Wave 2 |
| AuthGate, role redirects, protected routing | Wave 2 |
| API request wrapper, authorization header, API errors | Wave 3 |
| Query keys/cache, retry/refetch, models TypeScript | Wave 3 |
| Fallback pilot data e local snapshot primitives | Wave 3 |
| Manager dashboard | Wave 4 |
| Team context home/away e manager config | Wave 4 |
| Roster players/staff, ricerca, selezione, reorder | Wave 5 |
| Match sheet business validation | Wave 5 |
| Manager photo upload/crop/store/approval request | Wave 6 |
| Match sheet submit/reset/read-only lifecycle | Wave 6 |
| Referee dashboard | Wave 7 |
| Sheet verification, lock sheets, start recognition | Wave 7 |
| Recognition subject loading and decisions | Wave 8 |
| Complete recognition and step locking | Wave 8 |
| Report draft, result, events, notes, validation, submit | Wave 9 |
| Federation dashboard KPIs | Wave 10 |
| Federation match calendar and filters | Wave 10 |
| Federation reports detail | Wave 11 |
| Federation photo approval/rejection | Wave 11 |
| Federation history/audit | Wave 11 |
| Full regression/e2e/hardening/accessibility/performance | Wave 12 |

## 4. Wave dettagliate

---

## Wave 0 — Governance, Source of Truth e matrice di copertura

### Nome

Governance, Source of Truth e matrice di copertura.

### Obiettivo

Stabilire il perimetro definitivo del Binario B e creare la matrice di tracciabilità tra Web e Mobile prima di qualunque implementazione mobile.

### Motivazione

Il Mobile non deve introdurre interpretazioni autonome. Serve una baseline verificabile che dica quali route, servizi, componenti, validazioni, test e endpoint del Web sono coperti da una Wave.

### Dipendenze

Nessuna.

### Funzionalità incluse

- Inventario cartelle Web: `src/app`, `src/components`, `src/features`, `src/lib`, `tests`.
- Inventario route App Router.
- Inventario componenti condivisi.
- Inventario servizi e API client.
- Inventario hook/provider.
- Inventario store localStorage e fallback demo.
- Inventario test Web da portare o usare come acceptance criteria.
- Mappa endpoint backend consumati dal Web.
- Registro delle regole di business intoccabili.
- Registro gap/decisioni mobile, senza prendere decisioni dal Client Mobile.

### Funzionalità escluse

- Implementazione mobile.
- Modifiche Web.
- Modifiche backend.
- Design UI definitivo.

### Ruoli coinvolti

Tutti: `manager`, `referee`, `federation`, utente non autenticato.

### Pagine Web coinvolte

Tutte:

- `/`
- `/manager`
- `/manager/match-sheet`
- `/referee`
- `/referee/match`
- `/federation`

### Componenti coinvolti

Tutti come inventario, senza implementazione:

- `AuthGate`
- `LoginForm`
- `MatchSheetWorkflow`
- `RefereeMatchWorkflow`
- `FederationWorkflow`
- UI primitives.

### Provider coinvolti

- `Providers`
- `QueryClientProvider`
- `SessionProvider`
- `ToastProvider`
- `ErrorBoundary`

### Hook coinvolti

- `useSession`
- `useQuery`
- `useMutation`
- `useQueryClient`
- `useToast`
- hook React interni (`useState`, `useMemo`, `useEffect`).

### Servizi coinvolti

Tutti in inventario:

- `api-client`
- `auth-client`
- `session`
- `manager-team`
- `manager-photo-store`
- `submitted-match-sheet`
- `submitted-report`
- `federation-api-client`
- `referee-api-client`
- validazioni distinta/referto.

### API coinvolte

Tutte in inventario, nessuna implementazione.

### Regole di business coinvolte

Tutte catalogate, nessuna implementazione:

- ruoli e redirect;
- distinta draft/submitted/locked;
- validazioni distinta;
- foto pending/approved/rejected;
- recognition pending/approved/rejected;
- referto e cronologia eventi;
- calendario/referti/storico federazione.

### Criteri di completamento

- Matrice Web -> Wave completa.
- Nessuna route Web senza Wave.
- Nessun endpoint usato dal Web senza Wave.
- Nessun test Web critico senza Wave di riferimento.
- Nessuna regola business senza Wave proprietaria.

### Criteri di test

- Review documentale del catalogo.
- Controllo con `rg --files` su `refcheckid-web/src` e `refcheckid-web/tests`.
- Controllo manuale endpoint da client Web e API backend.

### Criteri di Feature Parity

- Il piano copre il 100% della superficie Web nota prima di implementare Mobile.

### Checklist Feature Parity Wave 0

- [ ] Route Web inventariate.
- [ ] Componenti Web inventariati.
- [ ] Provider/hook inventariati.
- [ ] Servizi e store inventariati.
- [ ] Endpoint inventariati.
- [ ] Test inventariati.
- [ ] Regole business inventariate.
- [ ] Mappa Wave senza sovrapposizioni approvata.

---

## Wave 1 — Fondazioni applicative, configurazione e design system minimo

### Nome

Fondazioni applicative, configurazione e design system minimo.

### Obiettivo

Replicare la shell tecnica del Web necessaria a tutte le funzionalità successive: bootstrap, provider root, tema/stili, componenti UI base, notifiche e fallback errore.

### Motivazione

Le pagine di ruolo dipendono da una base coerente per stati, feedback, layout e gestione errori. Senza questa Wave, le successive duplicano UI e comportamento.

### Dipendenze

Wave 0.

### Funzionalità incluse

- Root app bootstrap equivalente a `layout.tsx`.
- Provider container equivalente a `providers.tsx`.
- Configurazione API base URL equivalente a `getApiBaseUrl`.
- Utility di composizione classi equivalente a `cn`/`utils`.
- UI primitives:
  - Button;
  - Card;
  - Input;
  - SkeletonBlock;
  - EmptyState;
  - ErrorState;
  - ToastProvider/useToast;
  - ErrorBoundary.
- Stati UI standardizzati:
  - loading;
  - error con retry;
  - empty;
  - success/error toast;
  - fallback crash.
- Principi responsive/mobile per sostituire sidebar/griglie Web senza cambiare contenuti.

### Funzionalità escluse

- Login e sessione.
- API autorizzate.
- Dashboard di ruolo.
- Workflow dominio.

### Ruoli coinvolti

Tutti indirettamente; nessuna schermata di ruolo ancora completa.

### Pagine Web coinvolte

- `src/app/layout.tsx`
- `src/app/providers.tsx`
- `src/app/globals.css`

### Componenti coinvolti

- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/input.tsx`
- `components/ui/state.tsx`
- `components/ui/toast.tsx`
- `components/ui/error-boundary.tsx`

### Provider coinvolti

- Query provider come infrastruttura, anche se le query reali arrivano in Wave 3.
- Toast provider.
- Error boundary.

### Hook coinvolti

- `useToast`.
- Hook interni per stato toast/error boundary.

### Servizi coinvolti

- `api-base-url` solo come configurazione non autenticata.
- `utils`.

### API coinvolte

Nessun endpoint dominio. Solo preparazione della configurazione base URL.

### Regole di business coinvolte

- Stato loading non deve mostrare dati parziali mutabili.
- Stato error deve permettere retry quando la query lo supporta.
- Stato empty deve essere distinto da errore.
- Toast deve distinguere success/error.

### Criteri di completamento

- Tutte le schermate future possono usare UI primitives comuni.
- Esiste fallback globale agli errori runtime.
- Esiste sistema toast utilizzabile da workflow manager/referee/federation.
- Esiste configurazione API base URL coerente con Web.

### Criteri di test

- Unit/snapshot test dei componenti UI base.
- Test di rendering per loading/error/empty.
- Test del provider toast.
- Test della risoluzione base URL.

### Criteri di Feature Parity

- Gli stati base Mobile devono essere semanticamente equivalenti a `SkeletonBlock`, `ErrorState`, `EmptyState` e `Toast` Web.
- Il Mobile può cambiare layout, ma non può eliminare retry, messaggi o distinzione tra stati.

### Checklist Feature Parity Wave 1

- [ ] Root bootstrap implementato.
- [ ] Provider root implementati.
- [ ] API base URL configurabile.
- [ ] Button equivalente.
- [ ] Card equivalente.
- [ ] Input equivalente.
- [ ] Skeleton/loading equivalente.
- [ ] Empty state equivalente.
- [ ] Error state con retry equivalente.
- [ ] Toast success/error equivalente.
- [ ] Error boundary equivalente.
- [ ] Utility comuni disponibili.

---

## Wave 2 — Sessione, autenticazione, autorizzazione e routing protetto

### Nome

Sessione, autenticazione, autorizzazione e routing protetto.

### Obiettivo

Replicare login, persistenza sessione, refresh, logout, redirect per ruolo e protezione delle schermate.

### Motivazione

Ogni funzionalità di dominio è role-based. La Feature Parity non è possibile se utenti e ruoli non vengono gestiti come nel Web.

### Dipendenze

Wave 1.

### Funzionalità incluse

- Modello sessione `AppSession`.
- Ruoli `manager`, `referee`, `federation`.
- Login form equivalente.
- Persistenza sessione sicura equivalente alla semantica `refcheckid.session`.
- Lettura sessione all'avvio.
- Validazione minima sessione.
- Refresh token.
- Logout remoto e locale.
- Role redirects:
  - `manager` -> area manager;
  - `referee` -> area arbitro;
  - `federation` -> area federazione.
- Auth guard equivalente ad `AuthGate`.
- Stato “Verifica sessione…”.
- Redirect a login se sessione assente.
- Redirect alla propria area se ruolo errato.
- Barra/contesto utente e logout sulle aree protette.

### Funzionalità escluse

- Fetch dati dashboard.
- API client dominio.
- Workflow manager/referee/federation.

### Ruoli coinvolti

Tutti più utente non autenticato.

### Pagine Web coinvolte

- `/`
- tutte le pagine protette come target routing.

### Componenti coinvolti

- `LoginForm`
- `AuthGate`
- `Button`
- `Input`
- stati UI base.

### Provider coinvolti

- `SessionProvider`
- provider root di Wave 1.

### Hook coinvolti

- `useSession`
- hook routing/navigation mobile equivalenti.

### Servizi coinvolti

- `auth-client`
- `session`
- `api-base-url`

### API coinvolte

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Regole di business coinvolte

- Una sessione è valida solo con token, scadenza e user role.
- Un utente autenticato non deve restare sul login: va rediretto al ruolo.
- Un utente senza sessione non deve vedere pagine protette.
- Un utente con ruolo diverso non deve vedere pagina di altro ruolo.
- Logout rimuove sessione locale anche se logout remoto fallisce, mantenendo UX sicura.

### Criteri di completamento

- Login funzionante per tutti i ruoli supportati.
- Redirect automatico corretto.
- Guard su tutte le aree protette.
- Refresh token disponibile per Wave 3.
- Logout funzionante da ogni area protetta.

### Criteri di test

- Unit test auth client.
- Unit test session validation.
- Test routing per assenza sessione.
- Test routing per ruolo errato.
- Test refresh success/failure.
- Test logout.

### Criteri di Feature Parity

- Nessuna schermata protetta accessibile senza ruolo corretto.
- Sessione scaduta tenta refresh prima di invalidare l'utente.
- Redirect coerenti con Web.

### Checklist Feature Parity Wave 2

- [ ] Modello `AppRole` equivalente.
- [ ] Modello `AppSession` equivalente.
- [ ] Login API equivalente.
- [ ] Persistenza sessione equivalente.
- [ ] Validazione sessione equivalente.
- [ ] Refresh sessione equivalente.
- [ ] Logout API e locale equivalente.
- [ ] Redirect per ruolo equivalente.
- [ ] Guard pagine protette equivalente.
- [ ] Stato verifica sessione equivalente.
- [ ] Protezione ruolo errato equivalente.

---

## Wave 3 — API client, cache, error/loading/empty framework e contratti dati

### Nome

API client, cache, error/loading/empty framework e contratti dati.

### Obiettivo

Replicare il layer dati usato dal Web: wrapper request, header auth, error handling, query/cache, query keys, tipi e store locali usati come fallback/snapshot.

### Motivazione

Le Wave di ruolo devono consumare dati in modo uniforme. Il Web centralizza request, session refresh e query keys; il Mobile deve fare lo stesso prima dei workflow.

### Dipendenze

Wave 2.

### Funzionalità incluse

- Wrapper request equivalente:
  - base URL;
  - JSON content-type;
  - Authorization bearer se sessione presente;
  - refresh se sessione scaduta;
  - errore su response non OK;
  - gestione 204.
- Query/cache framework equivalente a React Query:
  - query keys;
  - invalidation;
  - retry manuale da ErrorState;
  - mutation success/error.
- Client API comune:
  - matches;
  - match sheets;
  - reports;
  - photos;
  - players;
  - staff;
  - recognitions.
- Tipi dati comuni:
  - `ApiMatch`, `ApiMatchSheet`, `ApiReport`, `ApiPhoto`;
  - tipi manager/referee/federation.
- Fallback pilot data e override foto.
- Store locali equivalenti:
  - manager photo approval requests;
  - submitted match sheet snapshot;
  - submitted federation report.
- Utility di normalizzazione dati usate dai client specializzati.

### Funzionalità escluse

- UI dashboard specifiche.
- Validazioni distinta/referto, salvo esportazione modelli.
- Workflow dominio.

### Ruoli coinvolti

Tutti come consumatori dati.

### Pagine Web coinvolte

Tutte le pagine dati, ma senza implementarne l'interfaccia finale.

### Componenti coinvolti

- Stati UI Wave 1 per integrare query loading/error/empty.

### Provider coinvolti

- Query/cache provider.
- SessionProvider per token.

### Hook coinvolti

- Hook query/mutation equivalenti.
- `useSession` come dipendenza request.

### Servizi coinvolti

- `api-client`
- `federation-api-client` solo contratti base, implementazioni complete nelle Wave 10-11.
- `referee-api-client` solo contratti base, implementazioni complete nelle Wave 7-9.
- `manager-photo-store`
- `submitted-match-sheet`
- `submitted-report`
- `pilot-data`
- `types`, `referee-types`, `federation-types`

### API coinvolte

- `GET /matches`
- `GET /matches?clubId=...`
- `GET /match-sheets`
- `GET /match-sheets?clubId=...`
- `GET /match-sheets?matchId=...`
- `POST /match-sheets/{id}/submit`
- `POST /match-sheets/{id}/lock`
- `POST /match-sheets/{id}/reset-smoke`
- `GET /match-reports`
- `GET /match-reports?matchId=...`
- `PATCH /match-reports/{id}`
- `POST /match-reports/{id}/submit`
- `GET /players`
- `GET /staff-members`
- `GET /photos`
- `POST /recognitions/start`
- `POST /recognitions/complete`
- `GET /audit/by-action?action=MATCH_ARCHIVED`

### Regole di business coinvolte

- Response non OK è errore applicativo.
- 204 non deve tentare JSON parse.
- Token valido deve essere inviato su ogni API dopo login.
- Query keys devono permettere invalidation coerente dopo submit/reset/decisioni.
- Fallback pilot data si usa quando backend ritorna liste vuote per roster.

### Criteri di completamento

- Tutti gli endpoint usati dal Web hanno funzione client Mobile o equivalente.
- Tutti i tipi necessari alle Wave successive sono disponibili.
- Query/cache supporta invalidation dopo mutation.
- Store locali equivalenti disponibili per snapshot e demo flow.

### Criteri di test

- Unit test request wrapper.
- Unit test API non OK.
- Unit test 204.
- Unit test authorization header.
- Unit test refresh on expired session.
- Unit test query key/invalidation.
- Unit test local snapshot serialization.

### Criteri di Feature Parity

- Ogni servizio Web usato dalle pagine ha un equivalente Mobile prima di implementare UI di dominio.
- Gli errori esposti alla UI hanno la stessa semantica del Web.

### Checklist Feature Parity Wave 3

- [ ] Request wrapper equivalente.
- [ ] Authorization header equivalente.
- [ ] Refresh sessione integrato nelle request.
- [ ] Errore su response non OK equivalente.
- [ ] Gestione 204 equivalente.
- [ ] Query keys equivalenti.
- [ ] Query loading/error/refetch equivalente.
- [ ] Mutation success/error/invalidation equivalente.
- [ ] Client matches equivalente.
- [ ] Client match-sheets equivalente.
- [ ] Client match-reports equivalente.
- [ ] Client players equivalente.
- [ ] Client staff equivalente.
- [ ] Client photos equivalente.
- [ ] Client recognitions equivalente.
- [ ] Client audit equivalente.
- [ ] Tipi manager equivalenti.
- [ ] Tipi referee equivalenti.
- [ ] Tipi federation equivalenti.
- [ ] Store snapshot distinta equivalente.
- [ ] Store report inviato equivalente.
- [ ] Store foto manager equivalente.
- [ ] Fallback pilot data equivalente.

---

## Wave 4 — Dashboard Manager e contesto squadra

### Nome

Dashboard Manager e contesto squadra.

### Obiettivo

Replicare l'area iniziale dirigente: contesto club/squadra, prossima gara, stato distinta, notifiche e navigazione verso distinta.

### Motivazione

È la prima area di dominio dopo auth. Stabilisce il contesto club che le Wave 5-6 useranno per roster, distinte e foto.

### Dipendenze

Wave 3.

### Funzionalità incluse

- Config manager team home/away.
- Risoluzione team corrente.
- Label club, clubId, opponent.
- Fetch dashboard manager.
- Ordinamento gare per `scheduledAt`.
- Identificazione prossima gara.
- Associazione prima distinta alla prossima gara.
- Stato distinta formattato:
  - `draft`: bozza da completare;
  - `submitted`: inviata in attesa arbitro;
  - `locked`: presa in carico dall'arbitro.
- Notifiche manager derivate dallo stato distinta.
- UI dashboard:
  - header Area Dirigente;
  - CTA Apri distinta;
  - card prossima gara;
  - card stato distinta;
  - card notifiche.
- Loading/error/empty dashboard.

### Funzionalità escluse

- Editing distinta.
- Upload foto.
- Submit distinta.
- Workflow arbitro/federazione.

### Ruoli coinvolti

`manager`.

### Pagine Web coinvolte

- `/manager`

### Componenti coinvolti

- `AuthGate`
- `Card`
- `EmptyState`
- `ErrorState`
- `SkeletonBlock`
- link/navigazione.

### Provider coinvolti

- Session provider.
- Query provider.
- Toast provider solo infrastruttura.

### Hook coinvolti

- `useQuery`
- routing/link.

### Servizi coinvolti

- `fetchManagerDashboard`
- `fetchMatches`
- `fetchMatchSheets`
- `manager-team`
- `queryKeys.manager`

### API coinvolte

- `GET /matches?clubId=<managerClubId>`
- `GET /match-sheets?clubId=<managerClubId>`

### Regole di business coinvolte

- Il manager vede solo il proprio clubId.
- Prossima gara è la prima ordinata per `scheduledAt`.
- Venue null diventa “Da definire”.
- Se non esiste distinta, lo stato default visuale è `draft`.
- Le notifiche sono derivate dallo stato distinta.

### Criteri di completamento

- Manager autenticato vede dashboard completa.
- Errori API mostrano retry.
- Assenza prossima gara mostra empty state.
- CTA porta alla schermata distinta.

### Criteri di test

- Unit test manager team config/source.
- Unit test dashboard mapping.
- UI test loading/error/empty/data.
- Routing test manager-only.

### Criteri di Feature Parity

- Valori, stati e notifiche devono coincidere con Web per gli stessi dati API.

### Checklist Feature Parity Wave 4

- [ ] Config team manager equivalente.
- [ ] ClubId manager usato per API.
- [ ] Fetch matches club.
- [ ] Fetch match sheets club.
- [ ] Ordinamento prossima gara.
- [ ] Venue fallback “Da definire”.
- [ ] Stato distinta formattato.
- [ ] Notifiche stato distinta.
- [ ] Card prossima gara.
- [ ] Card stato distinta.
- [ ] Card notifiche.
- [ ] Empty nessuna gara.
- [ ] Error retry.
- [ ] CTA Apri distinta.

---

## Wave 5 — Distinta Manager: roster, selezione, ruoli e validazioni core

### Nome

Distinta Manager: roster, selezione, ruoli e validazioni core.

### Obiettivo

Replicare l'editing della distinta in stato draft, includendo roster, selezione convocati/staff, ruoli, numeri, capitano/vice, portiere, reorder e validazioni business.

### Motivazione

La distinta è il prerequisito operativo per riconoscimento e referto. Le regole di validazione sono intoccabili e vanno portate prima di submit/upload.

### Dipendenze

Wave 4.

### Funzionalità incluse

- Schermata `/manager/match-sheet` protetta.
- Caricamento giocatori.
- Caricamento staff.
- Caricamento match sheets per club.
- Fallback pilot roster se API vuota.
- Applicazione override foto già approvate.
- Stato locale selectedPlayers/selectedStaff.
- Ricerca giocatori per cognome/nome.
- Ordinamento filtrati per cognome.
- Selezione/deselezione giocatori.
- Blocco sospesi.
- Se deselezionato, reset capitano/vice.
- Selezione/deselezione staff.
- Numero maglia.
- Ruolo titolare/riserva.
- Flag portiere.
- Flag capitano.
- Flag vice capitano.
- Reorder convocati: drag Web o UX mobile equivalente senza cambiare ordine dati.
- Read-only se distinta non draft, per la parte editing.
- Validazione distinta:
  - almeno un giocatore;
  - almeno uno staff;
  - numeri maglia completi;
  - numeri duplicati vietati;
  - sospesi non validi;
  - esattamente 11 titolari;
  - esattamente 1 portiere tra titolari;
  - massimo 20 riserve;
  - massimo 5 staff;
  - massimo 1 capitano;
  - capitano tra titolari;
  - massimo 1 vice;
  - vice tra titolari;
  - capitano e vice diversi.
- Errori validazione e submit error derivato.

### Funzionalità escluse

- Upload foto e crop.
- Persistenza foto pending.
- Submit distinta.
- Reset distinta prova.
- Workflow arbitro.

### Ruoli coinvolti

`manager`.

### Pagine Web coinvolte

- `/manager/match-sheet`

### Componenti coinvolti

- `MatchSheetWorkflow`
- `Button`
- `Input`
- `Card`
- stati UI.
- componenti/list item interni del workflow.

### Provider coinvolti

- Auth/session provider.
- Query provider.
- Toast provider come infrastruttura.

### Hook coinvolti

- `useState`
- `useMemo`
- `useQuery`
- `useQueryClient` solo preparazione invalidation future.

### Servizi coinvolti

- `fetchPlayers`
- `fetchStaff`
- `fetchMatchSheets`
- `validateMatchSheet`
- `getMatchSheetSubmitError`
- `getPlayerStatusLabel`
- `getPlayerStatusTone`
- `lineupRoleOptions`
- `manager-team`
- `pilot-data`
- `manager-photo-store` solo lettura override approvati.

### API coinvolte

- `GET /players`
- `GET /staff-members`
- `GET /match-sheets?clubId=<managerClubId>`

### Regole di business coinvolte

Tutte le regole core distinta elencate sopra.

### Criteri di completamento

- Manager può comporre una distinta draft valida.
- Manager riceve errori identici o equivalenti ai messaggi Web.
- Stato non draft rende editing non modificabile.
- Validazione produce stesso risultato del Web sugli stessi input.

### Criteri di test

- Porting test `match-sheet-validation.test.ts`.
- Test selezione sospesi.
- Test reset capitano/vice su deselezione.
- Test numeri duplicati/mancanti.
- Test 11 titolari e portiere.
- Test limiti panchina/staff.
- Test read-only quando `submitted`/`locked`.

### Criteri di Feature Parity

- Per ogni combinazione roster/staff, `validateMatchSheet` Mobile deve produrre gli stessi errori del Web.
- Il Mobile può sostituire drag-and-drop con reorder nativo, ma l'ordine finale dei convocati deve essere equivalente.

### Checklist Feature Parity Wave 5

- [ ] Page guard manager.
- [ ] Fetch players.
- [ ] Fetch staff.
- [ ] Fetch sheet club.
- [ ] Fallback pilot roster.
- [ ] Override foto approvate applicati.
- [ ] Ricerca nome/cognome.
- [ ] Ordinamento per cognome.
- [ ] Select/deselect player.
- [ ] Sospesi bloccati/non validi.
- [ ] Reset capitano/vice su deselezione.
- [ ] Select/deselect staff.
- [ ] Numero maglia.
- [ ] Ruolo starter/reserve.
- [ ] Flag goalkeeper.
- [ ] Flag captain.
- [ ] Flag vice captain.
- [ ] Reorder convocati equivalente.
- [ ] Read-only non draft per editing.
- [ ] Validazione almeno un giocatore.
- [ ] Validazione almeno uno staff.
- [ ] Validazione numeri mancanti.
- [ ] Validazione numeri duplicati.
- [ ] Validazione sospesi.
- [ ] Validazione 11 titolari.
- [ ] Validazione 1 portiere titolare.
- [ ] Validazione massimo 20 riserve.
- [ ] Validazione massimo 5 staff.
- [ ] Validazione massimo 1 capitano.
- [ ] Validazione capitano titolare.
- [ ] Validazione massimo 1 vice.
- [ ] Validazione vice titolare.
- [ ] Validazione capitano/vice diversi.

---

## Wave 6 — Distinta Manager: upload foto, richieste approvazione e submit lifecycle

### Nome

Distinta Manager: upload foto, richieste approvazione e submit lifecycle.

### Obiettivo

Completare il workflow distinta manager con upload/crop foto, gestione richieste approvazione Federazione, snapshot e invio distinta.

### Motivazione

La Wave 5 rende la distinta valida localmente; la Wave 6 la rende operativa per l'arbitro e completa il ciclo foto tesserati.

### Dipendenze

Wave 5.

### Funzionalità incluse

- Upload foto per player e staff.
- Validazione file immagine.
- Validazione massimo 5 MB.
- Lettura preview.
- Crop/zoom/offset equivalente.
- Conferma preview obbligatoria.
- Salvataggio foto soggetto tramite store manager.
- Logica foto:
  - se manca foto corrente, approvazione immediata locale;
  - se esiste foto corrente, richiesta pending per Federazione;
  - fino all'approvazione resta foto attuale.
- Toast success/error foto.
- Snapshot distinta inviata:
  - players convocati;
  - staff convocato;
  - team.
- Submit distinta:
  - solo prima sheet disponibile;
  - solo stato `draft`;
  - errore se nessuna distinta;
  - errore se già inviata;
  - `POST /match-sheets/{id}/submit`;
  - invalidation query match sheets.
- Reset smoke match sheet:
  - clear snapshot;
  - clear selections;
  - `POST /match-sheets/{id}/reset-smoke`;
  - invalidation query.
- Read-only post-submit/locked.

### Funzionalità escluse

- Decisione Federazione sulle foto, che appartiene alla Wave 11.
- Consumo arbitro della distinta, che appartiene alla Wave 7-8.

### Ruoli coinvolti

`manager`.

### Pagine Web coinvolte

- `/manager/match-sheet`

### Componenti coinvolti

- `MatchSheetWorkflow`
- controlli upload/crop interni.
- `Button`, `Card`, `Input`, `Toast`.

### Provider coinvolti

- Query provider.
- Toast provider.
- Session provider.

### Hook coinvolti

- `useState`
- `useMutation`
- `useQueryClient`
- `useToast`

### Servizi coinvolti

- `saveManagerSubjectPhoto`
- `saveSubmittedMatchSheetSnapshot`
- `clearSubmittedMatchSheetSnapshot`
- `submitMatchSheet`
- `resetSmokeMatchSheet`
- `validateMatchSheet`
- `cropPhotoDraft` equivalente.

### API coinvolte

- `POST /match-sheets/{id}/submit`
- `POST /match-sheets/{id}/reset-smoke`

### Regole di business coinvolte

- Distinta inviabile solo se draft.
- Distinta non inviabile senza sheet.
- Distinta già inviata non può essere reinviata senza reset smoke.
- Upload solo immagine massimo 5 MB.
- Preview obbligatoria.
- Foto con immagine preesistente passa da Federazione.
- Foto senza immagine preesistente può essere applicata subito.

### Criteri di completamento

- Manager completa workflow dalla distinta draft all'invio.
- Arbitro potrà leggere snapshot coerente nelle Wave successive.
- Richieste foto pending sono leggibili dalla Wave 11.
- Reset smoke mantiene comportamento Web per ambienti demo/test.

### Criteri di test

- Porting test `manager-photo-store.test.ts`.
- Test file non immagine.
- Test file >5 MB.
- Test conferma senza preview.
- Test foto no current -> approved.
- Test foto current -> pending.
- Test submit senza sheet.
- Test submit non draft.
- Test invalidation dopo submit/reset.

### Criteri di Feature Parity

- Stessi toast business e stessa semantica pending/approved.
- Stesso snapshot consumabile da arbitro.
- Stesse condizioni di abilitazione invio.

### Checklist Feature Parity Wave 6

- [ ] Upload player photo.
- [ ] Upload staff photo.
- [ ] Validazione MIME immagine.
- [ ] Validazione 5 MB.
- [ ] Preview immagine.
- [ ] Crop/zoom/offset equivalente.
- [ ] Conferma preview obbligatoria.
- [ ] Foto senza current approvata subito.
- [ ] Foto con current pending Federazione.
- [ ] Toast foto aggiornata.
- [ ] Toast richiesta approvazione.
- [ ] Snapshot players/staff/team.
- [ ] Submit solo draft.
- [ ] Errore nessuna distinta.
- [ ] Errore distinta già inviata.
- [ ] Invalidation match sheets.
- [ ] Reset smoke equivalente.
- [ ] Clear snapshot su reset.
- [ ] Clear selections su reset.
- [ ] Read-only post submit/locked.

---

## Wave 7 — Dashboard Arbitro e verifica distinte

### Nome

Dashboard Arbitro e verifica distinte.

### Obiettivo

Replicare landing arbitro e primo step del workflow gara: verifica distinte, stati casa/ospite, selezione squadra iniziale, lock e start recognition.

### Motivazione

Il riconoscimento non può iniziare senza distinte submitted/locked. Questa Wave crea il punto di passaggio tra dominio Manager e dominio Arbitro.

### Dipendenze

Wave 6.

### Funzionalità incluse

- Dashboard arbitro.
- Fetch prossima gara arbitro da matches.
- Ordinamento per `scheduledAt`.
- Stato gara normalizzato:
  - `completed` -> completed;
  - `in_progress` -> recognition;
  - altrimenti scheduled.
- Notifica stato gara.
- Empty nessuna gara.
- Navigazione a workflow match.
- Schermata `/referee/match` protetta.
- Stepper/tabs `Distinte`, `Riconoscimento`, `Referto` con solo step Distinte operativo.
- Fetch match sheets by matchId.
- Mappatura sheet:
  - clubId away -> away, altrimenti home;
  - `locked` -> locked;
  - `submitted` -> submitted;
  - `draft` -> missing.
- Card distinta casa/ospite:
  - lato gara;
  - club name;
  - stato;
  - conteggio players/staff da snapshot/fallback;
  - submittedAt.
- Default start team = squadra casa.
- Possibilità selezione squadra iniziale.
- Alert distinta ospite mancante.
- `canStart` solo se sheets non vuote e nessuna missing.
- Lock di tutte le sheet `submitted`.
- Start recognition API.
- Passaggio a step Riconoscimento dopo start.

### Funzionalità escluse

- Lista soggetti recognition e decisioni, Wave 8.
- Referto, Wave 9.

### Ruoli coinvolti

`referee`.

### Pagine Web coinvolte

- `/referee`
- `/referee/match`

### Componenti coinvolti

- `RefereeMatchWorkflow`
- `SheetVerificationStep`
- `TeamSheetCard`
- `AuthGate`
- `Card`, `Button`, stati UI.

### Provider coinvolti

- Session provider.
- Query provider.
- Toast provider come infrastruttura.

### Hook coinvolti

- `useSession`
- `useQuery`
- `useMutation`
- `useEffect`
- `useState`

### Servizi coinvolti

- `fetchRefereeDashboard`
- `fetchRefereeMatchSheets`
- `lockSubmittedSheetsAndStartRecognition`
- `fetchMatches`
- `fetchMatchSheets`
- `lockMatchSheet`
- `startRecognition`
- `submitted-match-sheet` snapshot builders/readers.

### API coinvolte

- `GET /matches`
- `GET /match-sheets?matchId=<matchId>`
- `POST /match-sheets/{id}/lock`
- `POST /recognitions/start`

### Regole di business coinvolte

- Nessuna gara assegnata -> empty.
- Riconoscimento non avviabile se una distinta è missing.
- Distinte submitted vengono locked prima di start recognition.
- La squadra di casa è default di partenza, ma arbitro può selezionare altra distinta.
- Draft lato API è missing nel contesto arbitro.

### Criteri di completamento

- Arbitro vede dashboard e può entrare nel match workflow.
- Distinte sono visualizzate correttamente.
- Start è disabilitato se missing.
- Start effettua lock + recognition start.

### Criteri di test

- Porting test `referee-api-client.test.ts` per dashboard/sheets.
- Test mapping `draft` -> `missing`.
- Test canStart false con away missing.
- Test lock solo submitted.
- Test start recognition chiamato.
- UI test stati loading/error/empty.

### Criteri di Feature Parity

- La disponibilità del bottone “Inizia riconoscimento” deve coincidere col Web.
- Le label stato distinta devono coincidere semanticamente.

### Checklist Feature Parity Wave 7

- [ ] Dashboard arbitro.
- [ ] Fetch matches.
- [ ] Ordinamento prossima gara.
- [ ] Stato gara normalizzato.
- [ ] Notifiche gara.
- [ ] Empty nessuna gara.
- [ ] Navigazione workflow match.
- [ ] Stepper Distinte/Riconoscimento/Referto.
- [ ] Fetch sheets by match.
- [ ] Mappatura home/away.
- [ ] Mappatura status locked/submitted/missing.
- [ ] Card casa.
- [ ] Card ospite.
- [ ] Conteggi players/staff da snapshot/fallback.
- [ ] Default casa.
- [ ] Selezione squadra iniziale.
- [ ] Alert distinta ospite mancante.
- [ ] Start disabled se missing.
- [ ] Lock submitted sheets.
- [ ] Start recognition API.
- [ ] Passaggio a step recognition.

---

## Wave 8 — Riconoscimento arbitrale completo

### Nome

Riconoscimento arbitrale completo.

### Obiettivo

Replicare il secondo step arbitro: caricamento soggetti da distinte, decisione approvato/rifiutato per ogni player/staff e completamento riconoscimento.

### Motivazione

Il referto è valido solo dopo riconoscimento completo. Questa Wave implementa la verifica identità digitale sul campo.

### Dipendenze

Wave 7.

### Funzionalità incluse

- Fetch recognition subjects.
- Origine soggetti:
  - snapshot home se sheet home submitted/locked;
  - snapshot away se sheet away submitted/locked;
  - fallback pilot snapshot se snapshot assente ma sheet non draft;
  - nessun soggetto se sheet draft/missing.
- Mapping soggetto:
  - id;
  - firstName/lastName;
  - shirtNumber;
  - teamName;
  - roleLabel;
  - subjectKind player/staff;
  - photoUrl;
  - document type/number/expiresAt;
  - decision pending.
- UI lista/card soggetti.
- Visualizzazione foto o placeholder.
- Visualizzazione documento.
- Decisione `approved`.
- Decisione `rejected`.
- Stato `pending` default.
- Conteggio/progresso pending.
- Complete recognition solo se nessun pending.
- API complete recognition.
- Set `fullRecognitionComplete` true.
- Set `recognitionClosed` true.
- Blocco ritorno agli step precedenti dopo chiusura.
- Passaggio/abilitazione referto.

### Funzionalità escluse

- Referto e validazioni eventi, Wave 9.
- Decisioni foto federazione, Wave 11.

### Ruoli coinvolti

`referee`.

### Pagine Web coinvolte

- `/referee/match`

### Componenti coinvolti

- `RecognitionStep`
- card soggetto interne.
- `Button`, `Card`, `EmptyState`, `ErrorState`, `SkeletonBlock`.

### Provider coinvolti

- Query provider.
- Session provider.
- Toast provider se feedback implementato.

### Hook coinvolti

- `useQuery`
- `useMutation`
- `useMemo`
- `useState`

### Servizi coinvolti

- `fetchRecognitionSubjects`
- `completeRecognition`
- `submitted-match-sheet`
- `manager-photo-store` overrides.
- `pilot-data`.

### API coinvolte

- `GET /match-sheets`
- `POST /recognitions/complete`

### Regole di business coinvolte

- Ogni soggetto parte pending.
- Il riconoscimento è completo solo se tutti i soggetti sono approved/rejected.
- Player e staff entrano nello stesso workflow di decisione.
- Dopo complete, step precedenti diventano non accessibili.
- Il referto non deve essere considerato abilitato prima di complete recognition.

### Criteri di completamento

- Tutti i soggetti attesi da snapshot/fallback sono visibili.
- Ogni soggetto può essere approvato/rifiutato.
- Complete è disabilitato finché esistono pending.
- Complete chiama API e chiude step precedenti.

### Criteri di test

- Test mapping snapshot -> subjects.
- Test fallback pilot.
- Test pending default.
- Test complete disabled con pending.
- Test complete enabled senza pending.
- Test step lock dopo complete.
- UI test foto/documento/ruolo.

### Criteri di Feature Parity

- Lo stesso set di soggetti prodotto dal Web deve comparire nel Mobile con stessi campi business.
- Stessa logica di completamento: tutti decisi o nulla.

### Checklist Feature Parity Wave 8

- [ ] Fetch recognition subjects.
- [ ] Snapshot home consumato.
- [ ] Snapshot away consumato.
- [ ] Fallback pilot home/away.
- [ ] Esclusione draft/missing.
- [ ] Player mapping.
- [ ] Staff mapping.
- [ ] Document mapping.
- [ ] Decision pending default.
- [ ] UI foto/placeholder.
- [ ] UI nome/squadra/ruolo/numero.
- [ ] Approva soggetto.
- [ ] Rifiuta soggetto.
- [ ] Conteggio pending.
- [ ] Complete disabled con pending.
- [ ] Complete enabled senza pending.
- [ ] API complete recognition.
- [ ] Stato fullRecognitionComplete.
- [ ] Stato recognitionClosed.
- [ ] Step precedenti bloccati.

---

## Wave 9 — Referto arbitrale completo

### Nome

Referto arbitrale completo.

### Obiettivo

Replicare il terzo step arbitro: compilazione risultato, eventi, note, riepilogo validazioni, submit report e salvataggio per Federazione.

### Motivazione

Il referto è il documento ufficiale post-gara. Le validazioni Web impediscono incoerenze di risultato, cronologia e presenza in campo; devono essere portate integralmente.

### Dipendenze

Wave 8.

### Funzionalità incluse

- Step Referto accessibile solo dopo recognition complete.
- Fetch report draft by matchId.
- Modello `MatchReportDraft`.
- Sotto-step:
  - Risultato;
  - Gol;
  - Ammonizioni;
  - Espulsioni;
  - Sostituzioni;
  - Note;
  - Riepilogo.
- Report teams `Casa`, `Ospite`.
- Goal types:
  - Azione;
  - Rigore;
  - Punizione;
  - Calcio d'angolo diretto;
  - Autogol.
- Caution reasons.
- Expulsion reasons.
- Inserimento risultato casa/ospite.
- Inserimento eventi gol.
- Inserimento ammonizioni.
- Inserimento espulsioni.
- Inserimento sostituzioni con uscente/entrante.
- Inserimento note arbitro.
- Risoluzione player name da team + shirt number.
- Validazione report:
  - conteggio gol casa uguale risultato casa;
  - conteggio gol ospite uguale risultato ospite;
  - eventi gol non superiori al risultato totale;
  - minuti interi 1-120;
  - eventi ordinati cronologicamente per lista;
  - squadra obbligatoria;
  - numero maglia obbligatorio per gol/ammonizioni/espulsioni;
  - tesserato presente nella distinta;
  - nome coerente con squadra/maglia;
  - sostituzioni coerenti;
  - riserva non può avere eventi prima dell'ingresso;
  - player non ancora entrato non può avere evento;
  - player uscito/espulso non può avere eventi successivi;
  - espulso non può essere sostituito dopo espulsione;
  - uscita/espulsione deve avvenire dopo ultimo evento attivo.
- Riepilogo errori.
- Submit report:
  - serializzazione summary JSON;
  - `PATCH /match-reports/{id}`;
  - `POST /match-reports/{id}/submit`;
  - salvataggio report locale per Federazione.
- Toast success/error.

### Funzionalità escluse

- Visualizzazione federale del referto, Wave 11.
- Storico/audit federazione, Wave 11.

### Ruoli coinvolti

`referee`.

### Pagine Web coinvolte

- `/referee/match`

### Componenti coinvolti

- `MatchReportStep`
- componenti evento interni.
- `Button`, `Input`, `Card`, stati UI, Toast.

### Provider coinvolti

- Query provider.
- Session provider.
- Toast provider.

### Hook coinvolti

- `useQuery`
- `useMutation`
- `useMemo`
- `useState`

### Servizi coinvolti

- `fetchRefereeReport`
- `submitRefereeReport`
- `validateReportDraft`
- `countGoalsByTeam`
- `resolveReportPlayerName`
- `saveSubmittedFederationReport`
- `fetchRecognitionSubjects` come base validation.

### API coinvolte

- `GET /match-reports?matchId=<matchId>`
- `PATCH /match-reports/{id}`
- `POST /match-reports/{id}/submit`

### Regole di business coinvolte

Tutte le regole referto elencate sopra. Inoltre:

- Referto non inviabile finché riconoscimento non è completo.
- Summary inviato contiene risultato, eventi, squadre, refereeName, matchId, note.
- Report id fallback a matchId se draft non ha id.

### Criteri di completamento

- Arbitro può completare un referto valido end-to-end.
- Referto invalido espone tutti gli errori necessari.
- Submit produce report visibile dalla Federazione nelle Wave successive.

### Criteri di test

- Porting completo `referee-report-validation.test.ts`.
- Test count goals.
- Test minute range.
- Test chronological order.
- Test player/team coherence.
- Test reserve entry chronology.
- Test expelled/substituted chronology.
- Test submit PATCH then POST.
- Test local federation report saved.

### Criteri di Feature Parity

- `validateReportDraft` Mobile deve essere logicamente equivalente al Web su tutti i casi testati.
- Il payload summary deve essere compatibile con Federation Web mapping.

### Checklist Feature Parity Wave 9

- [ ] Referto accessibile solo dopo recognition complete.
- [ ] Fetch report draft.
- [ ] Sotto-step Risultato.
- [ ] Sotto-step Gol.
- [ ] Sotto-step Ammonizioni.
- [ ] Sotto-step Espulsioni.
- [ ] Sotto-step Sostituzioni.
- [ ] Sotto-step Note.
- [ ] Sotto-step Riepilogo.
- [ ] Goal types equivalenti.
- [ ] Caution reasons equivalenti.
- [ ] Expulsion reasons equivalenti.
- [ ] Risultato casa/ospite.
- [ ] Eventi gol.
- [ ] Eventi ammonizioni.
- [ ] Eventi espulsioni.
- [ ] Eventi sostituzioni.
- [ ] Note arbitro.
- [ ] Resolve player name.
- [ ] Validazione conteggio gol casa.
- [ ] Validazione conteggio gol ospite.
- [ ] Validazione gol non superiore risultato.
- [ ] Validazione minuti 1-120.
- [ ] Validazione cronologia lista eventi.
- [ ] Validazione squadra obbligatoria.
- [ ] Validazione numero maglia eventi primari.
- [ ] Validazione tesserato in distinta.
- [ ] Validazione nome coerente.
- [ ] Validazione sostituzioni.
- [ ] Validazione riserve.
- [ ] Validazione player non ancora entrato.
- [ ] Validazione eventi dopo uscita/espulsione.
- [ ] Validazione espulso non sostituito dopo.
- [ ] Riepilogo errori.
- [ ] PATCH report.
- [ ] POST submit report.
- [ ] Save submitted federation report.
- [ ] Toast success/error.

---

## Wave 10 — Federazione: cruscotto e calendario

### Nome

Federazione: cruscotto e calendario.

### Obiettivo

Replicare le prime due sezioni federali: dashboard KPI/notifiche e calendario gare con filtri.

### Motivazione

La Federazione usa dashboard e calendario per controllo operativo. Queste viste dipendono dai dati base e dai report, ma non richiedono ancora dettaglio referti/foto/storico.

### Dipendenze

Wave 3 per API base; Wave 9 per dati referti completi nel flusso end-to-end, ma la Wave 10 può essere sviluppata con dati backend/mock prima della Wave 11.

### Funzionalità incluse

- Pagina `/federation` protetta.
- Navigazione sezioni:
  - Cruscotto;
  - Calendario;
  - Referti;
  - Foto;
  - Storico.
- In questa Wave sono operative Cruscotto e Calendario; le altre sezioni possono mostrare placeholder non finali solo se chiaramente non completate.
- Federation dashboard:
  - reportsReceived;
  - matchesPending;
  - pendingPhotoRequests;
  - syncStatus;
  - notifications.
- KPI cards.
- Notifiche operative.
- Fetch federation matches.
- Mapping match list:
  - homeTeam/awayTeam da managerTeamConfig o id;
  - matchStatus normalized;
  - reportStatus normalized;
  - matchday da giorno UTC di scheduledAt;
  - refereeName fallback `Da assegnare`.
- Calendario gare.
- Filtro giornata.
- Filtro stato referto:
  - all;
  - missing;
  - draft;
  - submitted;
  - reviewed.
- Badge stato gara/referto.
- Empty “Nessuna gara trovata con i filtri selezionati.”
- Loading/error/retry per dashboard e calendario.

### Funzionalità escluse

- Dettaglio referti completo.
- Decisioni foto.
- Storico/audit.

### Ruoli coinvolti

`federation`.

### Pagine Web coinvolte

- `/federation`

### Componenti coinvolti

- `FederationWorkflow`
- `FederationDashboardPanel`
- `StatCard`
- `MatchCalendarPanel`
- `MatchList`
- `StatusBadge`
- `AuthGate`
- `Card`, `Input`, stati UI.

### Provider coinvolti

- Query provider.
- Session provider.

### Hook coinvolti

- `useState`
- `useMemo`
- `useQuery`

### Servizi coinvolti

- `fetchFederationDashboard`
- `fetchFederationMatches`
- `fetchFederationReports` come conteggio/status source.
- `fetchPhotoRequests` come conteggio pending.
- `fetchMatches`
- `fetchMatchReports`
- `readSubmittedFederationReports`
- `manager-team`.

### API coinvolte

- `GET /matches`
- `GET /match-reports?matchId=<matchId>`
- `GET /photos`

### Regole di business coinvolte

- `matchesPending` = gare con reportStatus diverso da `submitted` e `reviewed`.
- `reportsReceived` = numero referti federali ricevuti.
- `pendingPhotoRequests` = richieste foto status `pending`.
- Match status normalized: completed/in_progress/scheduled.
- Report status normalized: submitted/reviewed/draft/missing.
- Filtri calendario applicati in AND tra giornata e stato.

### Criteri di completamento

- Federazione vede dashboard KPI coerenti con dati Web.
- Calendario mostra lista gare e filtri equivalenti.
- Error/loading/empty equivalenti.

### Criteri di test

- Porting test `federation-api-client.test.ts` per dashboard/matches.
- Test mapping status.
- Test filters matchday/status.
- Test pending counts.
- UI test empty filtered list.

### Criteri di Feature Parity

- Per gli stessi matches/reports/photos, KPI e lista filtrata devono coincidere col Web.

### Checklist Feature Parity Wave 10

- [ ] Auth guard federation.
- [ ] Navigazione sezioni in ordine Web.
- [ ] Cruscotto operativo.
- [ ] KPI referti ricevuti.
- [ ] KPI gare in attesa.
- [ ] KPI richieste foto.
- [ ] Notifiche operative.
- [ ] Fetch federation matches.
- [ ] Mapping home/away team.
- [ ] Mapping referee fallback.
- [ ] Mapping matchday.
- [ ] Mapping match status.
- [ ] Mapping report status.
- [ ] Calendario gare.
- [ ] Filtro giornata.
- [ ] Filtro stato referto.
- [ ] Badge match status.
- [ ] Badge report status.
- [ ] Empty filtered list.
- [ ] Loading/error/retry dashboard.
- [ ] Loading/error/retry calendario.

---

## Wave 11 — Federazione: referti, foto, storico e audit

### Nome

Federazione: referti, foto, storico e audit.

### Obiettivo

Completare l'area federale con consultazione referti, approvazione/rifiuto foto e storico/audit.

### Motivazione

Questa Wave chiude il ciclo post-gara e il workflow foto iniziato dal Manager. È la Wave di supervisione federale completa.

### Dipendenze

Wave 10 e Wave 9 per referti completi; Wave 6 per richieste foto pending.

### Funzionalità incluse

#### Referti

- Fetch federation reports.
- Merge report locali inviati e backend submitted non duplicati.
- Parsing summary JSON se report backend ha summary strutturato.
- Fallback report se summary assente.
- Lista referti ricevuti.
- Selezione report.
- Default primo report.
- Dettaglio report:
  - homeTeam;
  - awayTeam;
  - refereeName;
  - submittedAt;
  - result;
  - refereeNotes;
  - commissionerNotes;
  - goals;
  - cautions;
  - expulsions;
  - substitutions.
- Empty nessun referto.

#### Foto

- Fetch photo requests da backend photos e local manager requests.
- Mappatura backend photo -> request.
- Lista richieste foto.
- Visualizzazione currentPhotoUrl.
- Visualizzazione proposedPhotoUrl.
- Stato `pending`, `approved`, `rejected`.
- Azione approva pending locale.
- Azione rifiuta pending locale.
- Decisione aggiorna manager photo approval store.
- Approvazione applica override foto.
- Rifiuto mantiene foto corrente.
- Toast decisione.
- Invalidation/refetch se necessario.
- Empty nessuna richiesta.

#### Storico/Audit

- Fetch federation history.
- Storico referti locali inviati:
  - matchLabel;
  - clubNames;
  - refereeName;
  - reportId;
  - auditSummary con risultato/eventi.
- Fetch audit backend `MATCH_ARCHIVED`.
- Merge storico locale + audit backend.
- Lista storico.
- Empty nessuno storico.

### Funzionalità escluse

- Nuove azioni amministrative non presenti nel Web.
- Modifica referti federazione.
- Upload foto da Federazione.

### Ruoli coinvolti

`federation`.

### Pagine Web coinvolte

- `/federation`

### Componenti coinvolti

- `ReportsPanel`
- `ReportList`
- `ReportDetail`
- `PhotoRequestsPanel`
- `HistoryPanel`
- `StatusBadge`
- `Button`, `Card`, stati UI, Toast.

### Provider coinvolti

- Query provider.
- Session provider.
- Toast provider.

### Hook coinvolti

- `useState`
- `useMemo`
- `useQuery`
- `useMutation` se implementato per decisioni foto.
- `useQueryClient`
- `useToast`

### Servizi coinvolti

- `fetchFederationReports`
- `fetchPhotoRequests`
- `fetchFederationHistory`
- `decideManagerPhotoApprovalRequest`
- `readManagerPhotoApprovalRequests`
- `readSubmittedFederationReports`
- `fetchPhotos`
- `fetchMatchReports`
- `fetchMatches`
- `request('/audit/by-action?action=MATCH_ARCHIVED')`

### API coinvolte

- `GET /matches`
- `GET /match-reports?matchId=<matchId>`
- `GET /photos`
- `GET /audit/by-action?action=MATCH_ARCHIVED`

### Regole di business coinvolte

- I report locali inviati hanno priorità sui backend duplicati tramite id.
- Solo report submitted/backend con `submittedAt` o status `submitted` sono ricevuti.
- Summary JSON valido va interpretato come referto strutturato.
- Foto pending può essere approvata o rifiutata.
- Approvazione rende effettiva la foto proposta.
- Rifiuto conserva foto corrente.
- Storico è consultivo e non modificabile.

### Criteri di completamento

- Federazione vede referti inviati dall'arbitro.
- Federazione vede e decide richieste foto manager.
- Federazione vede storico locale e audit backend.
- Nessuna funzione Web federale resta scoperta.

### Criteri di test

- Porting test `federation-api-client.test.ts` per reports/photos/history.
- Test merge local/backend reports.
- Test parse summary.
- Test photo pending approve/reject.
- Test history merge.
- UI test empty states.

### Criteri di Feature Parity

- Per gli stessi dati, le sezioni Referti, Foto e Storico devono mostrare gli stessi record e stati del Web.
- Le decisioni foto devono produrre gli stessi effetti sugli override manager.

### Checklist Feature Parity Wave 11

- [ ] Fetch federation reports.
- [ ] Merge local reports.
- [ ] Merge backend submitted reports.
- [ ] Dedup report id.
- [ ] Parse summary JSON.
- [ ] Fallback report summary.
- [ ] Lista referti.
- [ ] Selezione report.
- [ ] Default primo report.
- [ ] Dettaglio squadre/arbitro/data.
- [ ] Dettaglio risultato.
- [ ] Dettaglio note arbitro.
- [ ] Dettaglio note commissario.
- [ ] Dettaglio gol.
- [ ] Dettaglio ammonizioni.
- [ ] Dettaglio espulsioni.
- [ ] Dettaglio sostituzioni.
- [ ] Empty nessun referto.
- [ ] Fetch photo requests.
- [ ] Merge backend photos.
- [ ] Merge local photo requests.
- [ ] Visualizzazione foto corrente.
- [ ] Visualizzazione foto proposta.
- [ ] Stato pending.
- [ ] Stato approved.
- [ ] Stato rejected.
- [ ] Approva foto pending.
- [ ] Rifiuta foto pending.
- [ ] Override applicato su approvazione.
- [ ] Foto corrente mantenuta su rifiuto.
- [ ] Toast decisione foto.
- [ ] Empty nessuna foto.
- [ ] Fetch history.
- [ ] Storico report locali.
- [ ] Fetch audit MATCH_ARCHIVED.
- [ ] Merge history/audit.
- [ ] Audit summary.
- [ ] Empty nessuno storico.

---

## Wave 12 — Hardening finale, test end-to-end e certificazione 100% Feature Parity

### Nome

Hardening finale, test end-to-end e certificazione 100% Feature Parity.

### Obiettivo

Verificare che il Mobile raggiunga Feature Parity 100% con la Source of Truth Web, senza regressioni, gap di ruolo, differenze di validazione o stati mancanti.

### Motivazione

Le Wave precedenti implementano blocchi indipendenti. La Wave 12 certifica il comportamento integrato end-to-end.

### Dipendenze

Wave 1-11 completate.

### Funzionalità incluse

- Regression suite mobile completa.
- Porting/replica dei test Web critici.
- Happy path end-to-end:
  1. manager login;
  2. dashboard manager;
  3. compila distinta valida;
  4. upload foto pending;
  5. submit distinta;
  6. referee login;
  7. verifica distinte;
  8. lock/start recognition;
  9. decide tutti i soggetti;
  10. complete recognition;
  11. compila referto valido;
  12. submit referto;
  13. federation login;
  14. dashboard KPI aggiornata;
  15. calendario report submitted;
  16. dettaglio referto;
  17. approva/rifiuta foto;
  18. storico/audit consultabile.
- Negative path:
  - login fallito;
  - ruolo errato;
  - API error;
  - empty states;
  - distinta invalida;
  - foto invalida;
  - recognition pending;
  - referto invalido;
  - calendario senza risultati;
  - nessuna richiesta foto/referto/storico.
- Cross-role authorization.
- Offline/network error behavior se supportato dal Mobile, coerente con error state Web.
- Accessibilità minima mobile.
- Performance baseline per liste roster/referti.
- Matrice finale Web -> Mobile con stato completato.

### Funzionalità escluse

- Nuove feature non presenti nel Web.
- Refactor non necessari.
- Cambiamenti backend.

### Ruoli coinvolti

Tutti.

### Pagine Web coinvolte

Tutte.

### Componenti coinvolti

Tutti i componenti Mobile implementati come equivalenti delle aree Web.

### Provider coinvolti

Tutti.

### Hook coinvolti

Tutti.

### Servizi coinvolti

Tutti.

### API coinvolte

Tutti gli endpoint usati dal Web.

### Regole di business coinvolte

Tutte, con particolare attenzione a:

- autorizzazione per ruolo;
- distinta editabile solo draft;
- validazioni distinta;
- foto pending/approval;
- recognition complete solo senza pending;
- referto solo dopo recognition;
- validazioni cronologia referto;
- dashboard federale e merge dati.

### Criteri di completamento

- Tutte le checklist Wave 1-11 sono complete.
- Tutti i test critici passano.
- Nessuna route/funzione Web senza equivalente Mobile.
- Nessun endpoint usato dal Web senza client/test Mobile.
- Nessun messaggio/stato business essenziale mancante.
- Matrice di Feature Parity firmata.

### Criteri di test

- Unit test validazioni distinta.
- Unit test validazioni referto.
- Unit test auth/session/API client.
- Integration test per manager workflow.
- Integration test per referee workflow.
- Integration test per federation workflow.
- End-to-end happy path completo.
- End-to-end negative path per permessi/errori.
- Manual QA checklist su device/simulator.

### Criteri di Feature Parity

- Per gli stessi fixture/dati, Mobile e Web producono lo stesso stato finale e gli stessi errori business.
- Tutti i ruoli possono completare gli stessi workflow del Web.
- Nessun comportamento Mobile dipende da supposizioni non presenti nel Web.

### Checklist Feature Parity Wave 12

- [ ] Tutte le checklist precedenti complete.
- [ ] Test auth/session completi.
- [ ] Test API client completi.
- [ ] Test validazione distinta completi.
- [ ] Test validazione referto completi.
- [ ] Test manager workflow completi.
- [ ] Test referee workflow completi.
- [ ] Test federation workflow completi.
- [ ] E2E happy path completo.
- [ ] E2E negative path completo.
- [ ] Cross-role authorization verificata.
- [ ] Error/loading/empty verificati ovunque.
- [ ] Toast/notification verificati.
- [ ] Upload foto verificato.
- [ ] Cache/invalidation verificata.
- [ ] Snapshot locali verificati.
- [ ] Matrice Web -> Mobile completata.
- [ ] Certificazione 100% Feature Parity.

## 5. Roadmap completa fino al 100% Feature Parity

### Fase A — Preparazione e fondamenta

- Completare Wave 0.
- Completare Wave 1.
- Completare Wave 2.
- Completare Wave 3.

Exit criteria Fase A:

- app Mobile può avviarsi;
- login/guard funzionano;
- API client e stati async sono pronti;
- nessun workflow dominio ancora richiesto.

### Fase B — Dominio Manager

- Completare Wave 4.
- Completare Wave 5.
- Completare Wave 6.

Exit criteria Fase B:

- dirigente può preparare e inviare una distinta valida;
- foto tesserati generano pending/approved come Web;
- snapshot distinta è consumabile dall'arbitro.

### Fase C — Dominio Arbitro

- Completare Wave 7.
- Completare Wave 8.
- Completare Wave 9.

Exit criteria Fase C:

- arbitro può verificare distinte;
- arbitro può completare riconoscimento;
- arbitro può compilare e inviare referto valido;
- referto è disponibile per federazione.

### Fase D — Dominio Federazione

- Completare Wave 10.
- Completare Wave 11.

Exit criteria Fase D:

- federazione vede KPI, calendario, referti, foto e storico;
- federazione può approvare/rifiutare foto;
- workflow post-gara è completo.

### Fase E — Certificazione

- Completare Wave 12.

Exit criteria Fase E:

- tutte le Wave sono complete;
- test passano;
- matrice Web -> Mobile non ha gap;
- Feature Parity 100% certificata.

## 6. Regole finali per Codex Ref Mobile

1. Non usare il Client Mobile come riferimento per decidere scope o comportamento.
2. Non introdurre feature nuove prima della certificazione Feature Parity.
3. Non cambiare endpoint o payload per comodità mobile.
4. Non cambiare validazioni business.
5. Non cambiare semantica degli stati.
6. Puoi adattare layout e interazioni mobile solo se criteri, dati e risultati restano identici.
7. Ogni Wave deve chiudersi con checklist, test e review contro Source of Truth Web.
8. Se il piano non descrive un dettaglio, consultare direttamente il file Web corrispondente e aggiornare la matrice senza modificare il Web.
