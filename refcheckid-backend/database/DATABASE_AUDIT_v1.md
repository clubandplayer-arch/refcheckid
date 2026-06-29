# DATABASE_AUDIT_v1

**Versione:** v1.0  
**Stato:** Audit architetturale  
**Ultimo aggiornamento:** 2026-06-29

## 1. Scopo

Questo documento contiene l'audit architetturale delle 17 migrazioni PostgreSQL presenti in `refcheckid-backend/database/migrations`.

L'audit verifica coerenza rispetto a:

- Master Bible v1.0;
- Database Specification v1.0;
- Domain Model;
- Schema ER;
- requisiti tecnici della Milestone 8 PostgreSQL.

Questo documento non modifica migrazioni, non crea tabelle, non introduce API e non definisce RLS.

## 2. Fonti analizzate

| Fonte | Stato rilevato | Impatto sull'audit |
| --- | --- | --- |
| `MASTER_BIBLE/Master_Bible_v1.0.md` | Decisioni consolidate ad alto livello | Fonte valida per perimetro, stack, convenzioni e non-obiettivi |
| `DATA_PLATFORM/Database_Specification_v1.0.md` | Specifica strutturale con molte decisioni ancora marcate come non definitive | Fonte valida per criteri e vincoli di non invenzione; non sufficiente per validare ogni dettaglio dominio |
| `DATA_PLATFORM/Domain_Model.md` | Placeholder | Non consente verifica piena del modello di dominio |
| `DATA_PLATFORM/ER_Diagram.md` | Placeholder | Non consente verifica piena delle cardinalità ER definitive |
| 17 migrazioni PostgreSQL | Implementazione iniziale Milestone 8 | Oggetto principale dell'audit |

## 3. Sintesi esecutiva

Le migrazioni coprono tutte le 17 tabelle previste dalla Milestone 8 e includono UUID, FK, UNIQUE, CHECK, INDEX, `COMMENT ON TABLE` e `COMMENT ON COLUMN`.

L'audit rileva tuttavia problemi architetturali e di qualità dati che richiedono correzioni prima di considerare lo schema definitivo:

- alcune regole di dominio non sono enforceable con lo schema attuale;
- diverse UNIQUE non considerano la soft delete;
- alcune relazioni usano riferimenti polimorfici o campi generici senza FK verso l'entità reale;
- la strategia audit non è realmente append-only;
- Domain Model ed ER Diagram non sono ancora definiti, quindi la validazione completa non è possibile;
- alcune scelte possono generare problemi di scalabilità o performance con volumi elevati.

## 4. Verifica per area

### 4.1 Normalizzazione 3NF

**Esito:** parzialmente conforme.

Le tabelle principali sono generalmente normalizzate: anagrafiche, registrazioni, gare, distinte, riconoscimenti, referti ed eventi sono separate. Tuttavia sono presenti aree non pienamente 3NF o non verificabili:

- `audit_logs.metadata` usa `jsonb` generico;
- `audit_logs.entity_table` + `entity_id` rappresenta una relazione non normalizzata;
- alcune colonne `status` e `role` sono stringhe ripetute senza tabelle o tipi dedicati;
- `photos` e `identity_documents` usano ownership multi-colonna, accettabile come alternativa a riferimenti polimorfici ma da validare con ER definitivo.

### 4.2 Naming convention

**Esito:** conforme.

Le migrazioni usano naming `snake_case`, nomi tabella plurali, prefissi coerenti per vincoli (`fk_`, `uq_`, `chk_`) e indici (`idx_`).

### 4.3 Foreign Key

**Esito:** parzialmente conforme.

Le FK tecniche sono presenti nella maggior parte delle relazioni dirette. Restano criticità su relazioni di dominio non enforceable, in particolare coerenza tra club, match, match sheet e registrazioni.

### 4.4 UNIQUE

**Esito:** parzialmente conforme.

Le UNIQUE principali sono presenti. Il problema più rilevante è l'interazione con soft delete: righe cancellate logicamente continuano a bloccare nuovi inserimenti con gli stessi valori univoci.

### 4.5 CHECK

**Esito:** presente ma incompleto.

Ogni migrazione contiene CHECK, ma molte regole di dominio non sono enforceable perché Domain Model ed ER Diagram sono ancora placeholder.

### 4.6 Index

**Esito:** presente ma migliorabile.

Gli indici di base sono presenti su FK, stato e alcune date. Mancano strategie composite orientate ai workflow e agli access pattern previsti da Supabase/RLS e API future.

### 4.7 UUID

**Esito:** conforme.

Tutte le tabelle usano `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. La migrazione 0001 abilita `pgcrypto`.

### 4.8 Soft Delete

**Esito:** parzialmente conforme.

Tutte le tabelle hanno `deleted_at`, ma non esistono indici parziali o constraint che distinguano record attivi e cancellati logicamente. L'audit considera questo il problema trasversale principale.

### 4.9 Ownership dei dati

**Esito:** parzialmente conforme.

Le ownership principali sono ricavabili da FK verso `federations`, `clubs`, `referees` o soggetti proprietari. Tuttavia l'ownership non è uniforme e non è ancora derivata da una matrice ownership definitiva.

## 5. Osservazioni dettagliate

### OBS-001 — CRITICAL — Domain Model e Schema ER non sono definitivi

**Migrazioni impattate:** tutte.

**Descrizione:** `Domain_Model.md` e `ER_Diagram.md` sono ancora placeholder. Le migrazioni implementano un modello relazionale senza una fonte ER definitiva completa.

**Motivazione:** senza Domain Model ed ER Diagram non è possibile verificare formalmente cardinalità, ownership, attributi obbligatori, stati, cicli di vita e relazioni.

**Proposta di soluzione:** completare Domain Model e Schema ER, quindi rieseguire audit e riallineare le migrazioni prima dell'applicazione in ambienti condivisi.

### OBS-002 — CRITICAL — Le UNIQUE non sono compatibili con soft delete

**Migrazioni impattate:** `0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0007`, `0008`, `0009`, `0010`, `0011`, `0012`, `0013`, `0015`, `0016`, `0017`.

**Descrizione:** le UNIQUE constraint non escludono righe con `deleted_at IS NOT NULL`.

**Motivazione:** un record cancellato logicamente continua a occupare il valore univoco e impedisce la ricreazione di un record attivo equivalente.

**Proposta di soluzione:** sostituire, dove richiesto dalla regola funzionale, le UNIQUE constraint con unique index parziali su record attivi oppure definire esplicitamente che i valori restano riservati anche dopo soft delete.

### OBS-003 — HIGH — `updated_at` non viene aggiornato automaticamente

**Migrazioni impattate:** tutte.

**Descrizione:** tutte le tabelle hanno `updated_at`, ma non esiste una strategia applicativa o database che ne garantisca l'aggiornamento.

**Motivazione:** senza enforcement, `updated_at` può diventare incoerente e perdere valore di audit tecnico.

**Proposta di soluzione:** definire se `updated_at` viene gestito dall'applicazione o da trigger semplici dedicati in una milestone autorizzata.

### OBS-004 — HIGH — `audit_logs` non è realmente append-only

**Migrazioni impattate:** `0017_create_audit_logs.sql`.

**Descrizione:** `audit_logs` contiene `updated_at` e `deleted_at`, e non impedisce aggiornamenti o cancellazioni logiche.

**Motivazione:** una tabella audit dovrebbe preservare integrità storica. La presenza di campi mutabili indebolisce il principio di append-only.

**Proposta di soluzione:** definire una strategia audit immutabile. Se confermata, rimuovere soft delete da `audit_logs` oppure bloccare modifiche/cancellazioni tramite controlli autorizzati in una milestone dedicata.

### OBS-005 — HIGH — Relazione `audit_logs.entity_table/entity_id` non ha FK reale

**Migrazioni impattate:** `0017_create_audit_logs.sql`.

**Descrizione:** l'entità auditata è rappresentata da `entity_table` e `entity_id`, senza FK verso le tabelle reali.

**Motivazione:** il database non può garantire che `entity_id` esista nella tabella indicata da `entity_table`.

**Proposta di soluzione:** valutare una strategia audit accettata: riferimento polimorfico documentato, tabelle audit per dominio, oppure vincoli applicativi formalizzati.

### OBS-006 — HIGH — `recognitions.subject_id` non ha FK verso player/staff

**Migrazioni impattate:** `0012_create_recognitions.sql`.

**Descrizione:** `subject_type` distingue `player` e `staff`, ma `subject_id` non ha FK verso `match_sheet_players` o `match_sheet_staff`.

**Motivazione:** il database non garantisce che il soggetto riconosciuto esista o appartenga alla distinta della gara.

**Proposta di soluzione:** sostituire il riferimento polimorfico con FK esplicite nullable e CHECK di singolo soggetto, oppure introdurre una tabella astratta approvata dal Domain Model.

### OBS-007 — HIGH — `match_events.subject_id` non ha FK reale

**Migrazioni impattate:** `0014_create_match_events.sql`.

**Descrizione:** gli eventi possono riferirsi a `player`, `staff`, `club` o `referee`, ma il riferimento è polimorfico e non enforceable.

**Motivazione:** eventi riferiti a soggetti inesistenti o non collegati al match possono essere inseriti.

**Proposta di soluzione:** definire nel Domain Model la strategia di soggetto evento e introdurre FK esplicite o tabelle evento specializzate.

### OBS-008 — HIGH — `match_sheets.club_id` non è vincolato ai club della gara

**Migrazioni impattate:** `0008_create_matches.sql`, `0009_create_match_sheets.sql`.

**Descrizione:** una distinta può essere associata a qualsiasi club, non necessariamente `home_club_id` o `away_club_id` del match.

**Motivazione:** la relazione tra distinta e gara può diventare incoerente.

**Proposta di soluzione:** modellare una relazione match-club esplicita o introdurre vincoli/controlli approvati che assicurino che il club della distinta partecipi alla gara.

### OBS-009 — HIGH — Registrazioni in distinta non sono vincolate al club della distinta

**Migrazioni impattate:** `0004`, `0006`, `0009`, `0010`, `0011`.

**Descrizione:** `match_sheet_players` e `match_sheet_staff` referenziano registrazioni, ma non garantiscono che tali registrazioni appartengano al club della distinta.

**Motivazione:** una distinta potrebbe includere giocatori o staff registrati per un club diverso.

**Proposta di soluzione:** aggiungere chiavi composte o tabelle associative approvate che colleghino `match_sheet_id`, `club_id` e registrazione coerente.

### OBS-010 — MEDIUM — Status e role sono stringhe ripetute

**Migrazioni impattate:** `0001`-`0014`, `0015`, `0016`.

**Descrizione:** molte tabelle usano `status text` con CHECK locali e alcune usano `role text` senza vocabolario centralizzato.

**Motivazione:** CHECK duplicati possono divergere nel tempo e rendono più costosa la governance degli stati.

**Proposta di soluzione:** confermare nella Database Specification se gli stati restano CHECK locali, enum PostgreSQL o tabelle di lookup.

### OBS-011 — MEDIUM — Mancano indici compositi orientati ai workflow principali

**Migrazioni impattate:** `0008`, `0009`, `0012`, `0013`, `0014`, `0017`.

**Descrizione:** gli indici esistenti sono prevalentemente monocolonna. Mancano indici compositi per accessi frequenti presumibili come match per federazione/stato/data o audit per entità/data.

**Motivazione:** query operative e dashboard future potrebbero richiedere ordinamenti e filtri combinati.

**Proposta di soluzione:** dopo definizione API e workflow, aggiungere indici compositi guidati da query reali e piani di esecuzione.

### OBS-012 — MEDIUM — Indici su `deleted_at` non uniformi

**Migrazioni impattate:** molte tabelle.

**Descrizione:** alcune tabelle hanno indice su `deleted_at`, altre no.

**Motivazione:** se la soft delete è globale, le query operative filtreranno spesso `deleted_at IS NULL`; l'indicizzazione deve essere coerente.

**Proposta di soluzione:** definire una strategia unica: indici parziali sugli attivi, indici `deleted_at` solo su tabelle ad alto volume, oppure filtri gestiti diversamente.

### OBS-013 — MEDIUM — `photos` e `identity_documents` hanno ownership multi-colonna scalabile ma rigida

**Migrazioni impattate:** `0015`, `0016`.

**Descrizione:** le tabelle usano una colonna nullable per ogni owner possibile e CHECK con `num_nonnulls`.

**Motivazione:** la soluzione è enforceable con FK ma richiede alter table per ogni nuovo tipo owner.

**Proposta di soluzione:** mantenere se il set owner è stabile; altrimenti definire una strategia documentata per allegati/documenti multi-owner.

### OBS-014 — MEDIUM — `metadata jsonb` in audit può crescere senza governance

**Migrazioni impattate:** `0017_create_audit_logs.sql`.

**Descrizione:** `metadata` è libero e non ha schema documentato.

**Motivazione:** payload non governati complicano indicizzazione, retention, privacy e interrogazioni.

**Proposta di soluzione:** definire schema minimo dei metadata audit e limiti di contenuto nella Database Specification.

### OBS-015 — LOW — Mancano colonne esplicite per actor applicativo utente

**Migrazioni impattate:** `0017_create_audit_logs.sql`.

**Descrizione:** `audit_logs` supporta federation, club e referee come actor FK, ma non un utente applicativo dedicato.

**Motivazione:** quando saranno introdotti autenticazione e Supabase Auth, potrebbe servire correlare l'audit all'utente autenticato.

**Proposta di soluzione:** rimandare alla milestone Security/RLS e definire la correlazione con identità applicativa.

### OBS-016 — LOW — Commenti colonna generici in alcune migrazioni

**Migrazioni impattate:** `0001`-`0014`.

**Descrizione:** diversi commenti colonna sono descrizioni generiche generate dal nome colonna.

**Motivazione:** commenti generici sono meno utili per manutenzione e onboarding.

**Proposta di soluzione:** raffinare i commenti dopo approvazione di Domain Model ed ER definitivo.

### OBS-017 — LOW — Vincoli temporali minimi

**Migrazioni impattate:** `0003`, `0005`, `0008`, `0012`, `0014`, `0016`.

**Descrizione:** le date e timestamp hanno pochi vincoli di coerenza oltre a controlli minimi.

**Motivazione:** possono essere inseriti valori temporalmente incoerenti rispetto ai workflow reali.

**Proposta di soluzione:** definire nella State Machine e Operational Flow le regole temporali da trasformare in CHECK o validazioni applicative.

## 6. Ridondanze individuate

| Area | Valutazione |
| --- | --- |
| `status` testuali ripetuti | Ridondanza controllata ma da governare |
| timestamp tecnici su tutte le tabelle | Coerente con convenzione, ma audit log va rivalutato |
| `deleted_at` su tutte le tabelle | Coerente con soft delete, ma non sempre funzionalmente necessario |
| commenti colonna generici | Ridondanza documentale a basso impatto |

## 7. FK mancanti o non enforceable

| Area | Problema |
| --- | --- |
| `recognitions.subject_id` | Nessuna FK reale verso player/staff o distinta |
| `match_events.subject_id` | Nessuna FK reale verso player/staff/club/referee |
| `audit_logs.entity_id` | Nessuna FK reale verso entità auditata |
| `match_sheets.club_id` | Non garantisce partecipazione del club al match |
| `match_sheet_players` | Non garantisce registrazione coerente con club della distinta |
| `match_sheet_staff` | Non garantisce registrazione coerente con club della distinta |

## 8. Indici mancanti o da valutare

| Area | Indice da valutare |
| --- | --- |
| `matches` | `(federation_id, status, scheduled_at)` |
| `match_sheets` | `(match_id, status)` |
| `recognitions` | `(match_id, status, recognized_at)` |
| `match_reports` | `(referee_id, status, submitted_at)` |
| `match_events` | `(match_id, occurred_at)` |
| `audit_logs` | `(entity_table, entity_id, occurred_at)` |
| soft delete globale | indici parziali `WHERE deleted_at IS NULL` |

## 9. Colonne potenzialmente inutili o da rivalutare

| Colonna | Valutazione |
| --- | --- |
| `audit_logs.updated_at` | Potenzialmente incompatibile con append-only |
| `audit_logs.deleted_at` | Potenzialmente incompatibile con append-only |
| `deleted_at` su tabelle puramente storiche | Da validare con retention e audit strategy |
| `role text` su `match_sheet_players` | Da confermare nel Domain Model |
| `summary text` su `match_reports` | Da confermare nel Domain Model |

## 10. Problemi di scalabilità e performance

- Query su record attivi potrebbero degradare senza indici parziali compatibili con soft delete.
- Audit log può crescere rapidamente senza partizionamento, retention o indici compositi mirati.
- Eventi match possono crescere rapidamente e richiedere indice composito per match e ordine temporale.
- CHECK locali sugli status possono rendere onerose evoluzioni di stato su molte tabelle.
- Riferimenti polimorfici non enforceable spostano controlli su applicazione e aumentano rischio di inconsistenza.

## 11. Elenco migrazioni che richiedono modifiche

| Migrazione | Priorità | Motivo |
| --- | --- | --- |
| 0001_create_federations.sql | MEDIUM | Unique/soft delete e strategia indici attivi |
| 0002_create_clubs.sql | MEDIUM | Unique/soft delete e ownership |
| 0003_create_players.sql | MEDIUM | Unique/soft delete e vincoli documento/anagrafica |
| 0004_create_player_registrations.sql | HIGH | Coerenza registrazione-club-distinta e unique/soft delete |
| 0005_create_staff_members.sql | MEDIUM | Unique/soft delete |
| 0006_create_staff_registrations.sql | HIGH | Coerenza registrazione-club-distinta e unique/soft delete |
| 0007_create_referees.sql | MEDIUM | Unique/soft delete |
| 0008_create_matches.sql | HIGH | Partecipazione club, indici compositi workflow |
| 0009_create_match_sheets.sql | HIGH | Club distinta non vincolato ai club della gara |
| 0010_create_match_sheet_players.sql | HIGH | Registrazioni non vincolate al club della distinta |
| 0011_create_match_sheet_staff.sql | HIGH | Registrazioni non vincolate al club della distinta |
| 0012_create_recognitions.sql | HIGH | Riferimento soggetto non enforceable |
| 0013_create_match_reports.sql | MEDIUM | Unique/soft delete e indici workflow |
| 0014_create_match_events.sql | HIGH | Riferimento soggetto non enforceable e indici temporali |
| 0015_create_photos.sql | MEDIUM | Ownership rigida e unique/soft delete |
| 0016_create_identity_documents.sql | MEDIUM | Ownership rigida e unique/soft delete |
| 0017_create_audit_logs.sql | CRITICAL | Append-only non garantito, entity FK non enforceable, scalabilità audit |

## 12. Conclusione

Lo schema iniziale è una base utile e copre l'intero perimetro tabellare richiesto dalla Milestone 8. Tuttavia non deve essere considerato definitivo senza una revisione mirata.

Le correzioni prioritarie riguardano:

1. completamento di Domain Model e Schema ER;
2. riallineamento soft delete e UNIQUE;
3. rimozione o formalizzazione dei riferimenti polimorfici non enforceable;
4. coerenza club-match-distinte-registrazioni;
5. strategia audit append-only;
6. indici compositi guidati da workflow e query reali.
