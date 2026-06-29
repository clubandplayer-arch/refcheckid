# Supabase Security Review

**Versione:** v1.0  
**Stato:** Milestone 9 completata  
**Ultimo aggiornamento:** 2026-06-29

## 1. Scopo

Questo documento riepiloga la Milestone 9 Supabase Security per RefCheckID.

La milestone introduce:

- helper functions di sicurezza;
- Row Level Security per tutte le 17 tabelle PostgreSQL;
- policy RLS per lettura, inserimento, aggiornamento e cancellazione dove consentito;
- ruoli applicativi basati su JWT Supabase;
- storage bucket policies per `photos` e `identity-documents`;
- applicazione del Principle of Least Privilege;
- applicazione di Privacy by Design.

Non sono state modificate le migrazioni PostgreSQL della Milestone 8, il Domain Model o la Master Bible.

## 2. File prodotti

| File | Scopo |
| --- | --- |
| `functions/001_security_helpers.sql` | Funzioni helper per ruolo corrente, scope JWT e autorizzazioni riusabili |
| `policies/001_rls_policies.sql` | Abilitazione RLS e policy per tutte le tabelle applicative |
| `policies/002_storage_policies.sql` | Bucket privati e policy Supabase Storage |
| `policies/003_security_roles.md` | Documentazione dei ruoli e dei claim richiesti |
| `SECURITY_REVIEW.md` | Review finale della Milestone 9 |

## 3. Ruoli di sicurezza

| Ruolo | Ambito |
| --- | --- |
| `platform_admin` | Accesso globale amministrativo |
| `federation_admin` | Accesso limitato alla federazione del JWT |
| `club_admin` | Accesso limitato al club del JWT |
| `referee` | Accesso limitato all'arbitro del JWT e alle gare collegate |
| `authenticated` | Accesso minimo, solo tramite policy esplicite |

Nessuna policy applicativa è concessa al ruolo `anon`.

## 4. Helper functions

Le helper functions sono collocate nello schema `app_security` e centralizzano:

- lettura dei claim JWT;
- risoluzione ruolo applicativo;
- scope `federation_id`, `club_id`, `referee_id`;
- verifica accesso federazione;
- verifica accesso club;
- verifica accesso arbitro;
- verifica accesso gara;
- verifica accesso distinta;
- verifica capacità di gestione federazione/club.

## 5. Copertura RLS tabelle

| Tabella | RLS | Policy |
| --- | --- | --- |
| `federations` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `clubs` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `players` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `player_registrations` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `staff_members` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `staff_registrations` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `referees` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `matches` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `match_sheets` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `match_sheet_players` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `match_sheet_staff` | Abilitata | SELECT, INSERT, UPDATE, DELETE |
| `recognitions` | Abilitata | SELECT, INSERT, UPDATE, DELETE limitata |
| `match_reports` | Abilitata | SELECT, INSERT, UPDATE, DELETE limitata |
| `match_events` | Abilitata | SELECT, INSERT, UPDATE, DELETE limitata |
| `photos` | Abilitata | SELECT, INSERT, UPDATE, DELETE limitata |
| `identity_documents` | Abilitata | SELECT, INSERT, UPDATE, DELETE limitata |
| `audit_logs` | Abilitata | SELECT, INSERT; nessun UPDATE/DELETE |

## 6. Storage security

| Bucket | Pubblico | Policy |
| --- | --- | --- |
| `photos` | No | SELECT/INSERT autenticati; UPDATE/DELETE solo platform admin |
| `identity-documents` | No | SELECT/INSERT solo platform admin o federation admin; UPDATE/DELETE solo platform admin |

## 7. Principle of Least Privilege

La sicurezza segue i seguenti criteri:

- `anon` non riceve policy applicative;
- ogni tabella abilita RLS esplicitamente;
- le letture sono limitate dallo scope del JWT;
- scritture e cancellazioni sono più restrittive delle letture;
- `audit_logs` non consente update/delete via policy;
- bucket storage sono privati;
- documenti di identità hanno accesso più ristretto delle foto.

## 8. Privacy by Design

Le policy riducono l'esposizione dati tramite:

- isolamento per federazione;
- isolamento per club;
- isolamento per arbitro;
- nessun accesso anonimo;
- separazione tra foto e documenti di identità;
- accesso limitato ai log di audit;
- controllo centralizzato degli scope attraverso helper functions.

## 9. Osservazioni operative

- I claim JWT devono essere popolati da Supabase Auth o da un processo amministrativo autorizzato.
- Le policy presuppongono che `app_metadata.role`, `app_metadata.federation_id`, `app_metadata.club_id` e `app_metadata.referee_id` siano affidabili.
- Il `service_role` mantiene capacità amministrative Supabase e deve essere usato solo lato server sicuro.
- Le policy dovranno essere rieseguite in ambienti Supabase tramite pipeline controllata.

## 10. Esito finale

Milestone 9 completata con RLS, policy, ruoli, helper functions, storage bucket policies e review finale.
