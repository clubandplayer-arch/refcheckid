# Database Review v2 — Milestone 8 PostgreSQL

**Versione:** v2.0  
**Stato:** Aggiornato dopo DATABASE_AUDIT_v1  
**Ultimo aggiornamento:** 2026-06-29

## 1. Scopo

Questo documento riepiloga l'allineamento delle 17 migrazioni PostgreSQL al `DATABASE_AUDIT_v1.md`.

Le migrazioni sono state aggiornate in un unico intervento senza creare nuove tabelle, senza API, senza RLS e senza modificare Domain Model o Product Tree.

## 2. Migrazioni aggiornate

| Migrazione | Tabella | Aggiornamenti principali |
| --- | --- | --- |
| 0001_create_federations.sql | federations | Funzioni tecniche condivise, trigger `updated_at`, unique index parziali per soft delete |
| 0002_create_clubs.sql | clubs | Unique index parziali, indici parziali su record attivi, trigger `updated_at` |
| 0003_create_players.sql | players | Unique index parziali, indici attivi, trigger `updated_at` |
| 0004_create_player_registrations.sql | player_registrations | Unique index parziali, indici attivi, trigger `updated_at` |
| 0005_create_staff_members.sql | staff_members | Unique index parziali, indici attivi, trigger `updated_at` |
| 0006_create_staff_registrations.sql | staff_registrations | Unique index parziali, indici attivi, trigger `updated_at` |
| 0007_create_referees.sql | referees | Unique index parziali, indici attivi, trigger `updated_at` |
| 0008_create_matches.sql | matches | Indice composito workflow, unique index parziale, trigger `updated_at` |
| 0009_create_match_sheets.sql | match_sheets | Validazione club partecipante al match, unique index parziale, trigger `updated_at` |
| 0010_create_match_sheet_players.sql | match_sheet_players | Validazione registrazione player coerente con club distinta, unique index parziali, trigger `updated_at` |
| 0011_create_match_sheet_staff.sql | match_sheet_staff | Validazione registrazione staff coerente con club distinta, unique index parziale, trigger `updated_at` |
| 0012_create_recognitions.sql | recognitions | Rimossi riferimenti polimorfici, aggiunte FK esplicite verso soggetti distinta |
| 0013_create_match_reports.sql | match_reports | Unique index parziale, indice composito workflow, trigger `updated_at` |
| 0014_create_match_events.sql | match_events | Rimossi riferimenti polimorfici, aggiunte FK esplicite verso soggetti evento |
| 0015_create_photos.sql | photos | Ownership FK esplicita, unique index parziale, indici attivi |
| 0016_create_identity_documents.sql | identity_documents | Ownership FK esplicita, unique index parziali, indici attivi |
| 0017_create_audit_logs.sql | audit_logs | Audit append-only, rimosso soft delete/update tecnico, FK esplicite verso entità auditabili |

## 3. Osservazioni CRITICAL/HIGH eliminate

| Osservazione audit | Stato v2 | Motivazione |
| --- | --- | --- |
| OBS-002 — UNIQUE non compatibili con soft delete | Risolta | Le UNIQUE constraint sono state sostituite da unique index parziali `WHERE deleted_at IS NULL` sulle tabelle soft-deletable |
| OBS-003 — `updated_at` non aggiornato automaticamente | Risolta | Aggiunta funzione condivisa `set_updated_at()` e trigger `BEFORE UPDATE` sulle tabelle mutabili |
| OBS-004 — `audit_logs` non append-only | Risolta | `audit_logs` non contiene più `updated_at`/`deleted_at` e ha trigger che impedisce update/delete |
| OBS-005 — audit entity senza FK reale | Risolta | `audit_logs` usa colonne FK esplicite verso le entità auditabili previste dalla Milestone 8 |
| OBS-006 — recognition subject senza FK reale | Risolta | `recognitions` usa FK esplicite verso `match_sheet_players` e `match_sheet_staff` |
| OBS-007 — match event subject senza FK reale | Risolta | `match_events` usa FK esplicite verso player/staff di distinta, club e referee |
| OBS-008 — match sheet club non vincolato ai club gara | Risolta | Aggiunta validazione database che verifica che il club della distinta sia home o away club del match |
| OBS-009 — registrazioni in distinta non vincolate al club distinta | Risolta | Aggiunte validazioni database per player e staff registration coerenti con il club della distinta |

## 4. Tabelle create

Le tabelle restano le 17 previste dalla Milestone 8:

1. `federations`
2. `clubs`
3. `players`
4. `player_registrations`
5. `staff_members`
6. `staff_registrations`
7. `referees`
8. `matches`
9. `match_sheets`
10. `match_sheet_players`
11. `match_sheet_staff`
12. `recognitions`
13. `match_reports`
14. `match_events`
15. `photos`
16. `identity_documents`
17. `audit_logs`

## 5. Indici principali

| Area | Indici v2 |
| --- | --- |
| Soft delete | Unique index parziali `WHERE deleted_at IS NULL` |
| Record attivi | Indici FK/stato filtrati con `WHERE deleted_at IS NULL` |
| Matches | `idx_matches_federation_status_scheduled_at` |
| Match sheets | `idx_match_sheets_match_status` |
| Recognitions | `idx_recognitions_match_status_recognized_at` |
| Match reports | `idx_match_reports_referee_status_submitted_at` |
| Match events | `idx_match_events_match_occurred_at` |
| Audit logs | `idx_audit_logs_match_id_occurred_at`, `idx_audit_logs_player_id_occurred_at`, indici actor e action |

## 6. Foreign Key aggiornate

| Area | Aggiornamento |
| --- | --- |
| Recognitions | FK esplicite verso `match_sheet_players` e `match_sheet_staff` |
| Match events | FK esplicite verso `match_sheet_players`, `match_sheet_staff`, `clubs`, `referees` |
| Audit logs | FK esplicite verso tutte le entità auditabili della Milestone 8 |
| Photos | FK owner esplicite già mantenute |
| Identity documents | FK owner esplicite già mantenute |

## 7. CHECK e validazioni

| Area | Validazione |
| --- | --- |
| Soft ownership | `num_nonnulls` garantisce singolo owner per `photos`, `identity_documents`, `recognitions`, `match_events`, `audit_logs` |
| Match sheets | Trigger database garantisce club partecipante al match |
| Match sheet players | Trigger database garantisce registrazione player coerente con club distinta |
| Match sheet staff | Trigger database garantisce registrazione staff coerente con club distinta |
| Audit logs | Trigger database impedisce update e delete |

## 8. Osservazioni rimaste aperte

### OPEN-001 — CRITICAL — Domain Model e Schema ER non sono definitivi

**Motivazione:** il task vieta di modificare Domain Model e Product Tree. Inoltre `Domain_Model.md` ed `ER_Diagram.md` restano documenti separati da completare in milestone dedicate.

**Impatto:** alcune scelte v2 restano tecnicamente coerenti ma da validare contro Domain Model e Schema ER definitivi.

### OPEN-002 — MEDIUM — Status e role restano stringhe con CHECK locali

**Motivazione:** passare a enum PostgreSQL o lookup table sarebbe una decisione architetturale/dominio non autorizzata dal task.

**Impatto:** gli stati sono comunque validati, ma la governance futura degli stati richiederà revisione.

### OPEN-003 — MEDIUM — Ownership multi-colonna per allegati e documenti

**Motivazione:** la soluzione con FK esplicite è enforceable e non crea nuove tabelle; alternative più flessibili richiederebbero decisioni architetturali o nuove strutture.

**Impatto:** l'aggiunta futura di nuovi owner richiederà migrazione schema.

### OPEN-004 — MEDIUM — Metadata audit non tipizzato

**Motivazione:** tipizzare `metadata` richiede una specifica funzionale degli eventi auditabili non presente nei documenti vincolanti.

**Impatto:** il campo resta flessibile ma richiede governance applicativa.

### OPEN-005 — LOW — Commenti colonna ancora migliorabili

**Motivazione:** i commenti sono presenti su tutte le colonne ma potranno essere raffinati solo dopo Domain Model definitivo.

**Impatto:** nessun impatto strutturale sul database.

### OPEN-006 — LOW — Actor applicativo utente non modellato

**Motivazione:** introdurre un riferimento Supabase Auth o una tabella utenti sarebbe fuori scope e collegato a Security/RLS.

**Impatto:** l'audit supporta federation, club e referee come attori database; l'utente applicativo sarà da definire nella milestone sicurezza.

## 9. Conclusione

La Milestone 8 v2 elimina le osservazioni CRITICAL e HIGH risolvibili senza modificare Master Bible, Domain Model o Product Tree.

Restano aperte solo osservazioni che richiedono decisioni documentali o funzionali successive.
