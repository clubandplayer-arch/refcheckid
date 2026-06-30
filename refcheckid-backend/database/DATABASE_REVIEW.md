# Database Review — Milestone 8 PostgreSQL

**Versione:** v1.0  
**Stato:** Completato  
**Ultimo aggiornamento:** 2026-06-29

## Tabelle create

| Migrazione | Tabella |
| --- | --- |
| 0001_create_federations.sql | federations |
| 0002_create_clubs.sql | clubs |
| 0003_create_players.sql | players |
| 0004_create_player_registrations.sql | player_registrations |
| 0005_create_staff_members.sql | staff_members |
| 0006_create_staff_registrations.sql | staff_registrations |
| 0007_create_referees.sql | referees |
| 0008_create_matches.sql | matches |
| 0009_create_match_sheets.sql | match_sheets |
| 0010_create_match_sheet_players.sql | match_sheet_players |
| 0011_create_match_sheet_staff.sql | match_sheet_staff |
| 0012_create_recognitions.sql | recognitions |
| 0013_create_match_reports.sql | match_reports |
| 0014_create_match_events.sql | match_events |
| 0015_create_photos.sql | photos |
| 0016_create_identity_documents.sql | identity_documents |
| 0017_create_audit_logs.sql | audit_logs |

## Indici

| Tabella | Indici |
| --- | --- |
| federations | idx_federations_status, idx_federations_deleted_at |
| clubs | idx_clubs_federation_id, idx_clubs_status, idx_clubs_deleted_at |
| players | idx_players_federation_id, idx_players_name, idx_players_status |
| player_registrations | idx_player_registrations_player_id, idx_player_registrations_club_id, idx_player_registrations_status |
| staff_members | idx_staff_members_federation_id, idx_staff_members_name, idx_staff_members_status |
| staff_registrations | idx_staff_registrations_staff_member_id, idx_staff_registrations_club_id, idx_staff_registrations_status |
| referees | idx_referees_federation_id, idx_referees_name, idx_referees_status |
| matches | idx_matches_federation_id, idx_matches_home_club_id, idx_matches_away_club_id, idx_matches_referee_id, idx_matches_scheduled_at, idx_matches_status |
| match_sheets | idx_match_sheets_match_id, idx_match_sheets_club_id, idx_match_sheets_status |
| match_sheet_players | idx_match_sheet_players_match_sheet_id, idx_match_sheet_players_player_registration_id, idx_match_sheet_players_status |
| match_sheet_staff | idx_match_sheet_staff_match_sheet_id, idx_match_sheet_staff_staff_registration_id, idx_match_sheet_staff_status |
| recognitions | idx_recognitions_match_id, idx_recognitions_referee_id, idx_recognitions_subject, idx_recognitions_status |
| match_reports | idx_match_reports_match_id, idx_match_reports_referee_id, idx_match_reports_status |
| match_events | idx_match_events_match_id, idx_match_events_match_report_id, idx_match_events_event_type, idx_match_events_occurred_at |
| photos | idx_photos_player_id, idx_photos_staff_member_id, idx_photos_referee_id, idx_photos_match_id, idx_photos_match_report_id, idx_photos_status, idx_photos_deleted_at |
| identity_documents | idx_identity_documents_player_id, idx_identity_documents_staff_member_id, idx_identity_documents_referee_id, idx_identity_documents_number, idx_identity_documents_status |
| audit_logs | idx_audit_logs_actor_federation_id, idx_audit_logs_actor_club_id, idx_audit_logs_actor_referee_id, idx_audit_logs_entity, idx_audit_logs_occurred_at, idx_audit_logs_action |

## Foreign Keys

| Tabella | Foreign Keys |
| --- | --- |
| federations | Nessuna |
| clubs | federation_id → federations.id |
| players | federation_id → federations.id |
| player_registrations | player_id → players.id; club_id → clubs.id |
| staff_members | federation_id → federations.id |
| staff_registrations | staff_member_id → staff_members.id; club_id → clubs.id |
| referees | federation_id → federations.id |
| matches | federation_id → federations.id; home_club_id → clubs.id; away_club_id → clubs.id; referee_id → referees.id |
| match_sheets | match_id → matches.id; club_id → clubs.id |
| match_sheet_players | match_sheet_id → match_sheets.id; player_registration_id → player_registrations.id |
| match_sheet_staff | match_sheet_id → match_sheets.id; staff_registration_id → staff_registrations.id |
| recognitions | match_id → matches.id; referee_id → referees.id |
| match_reports | match_id → matches.id; referee_id → referees.id |
| match_events | match_id → matches.id; match_report_id → match_reports.id |
| photos | player_id → players.id; staff_member_id → staff_members.id; referee_id → referees.id; match_id → matches.id; match_report_id → match_reports.id |
| identity_documents | player_id → players.id; staff_member_id → staff_members.id; referee_id → referees.id |
| audit_logs | actor_federation_id → federations.id; actor_club_id → clubs.id; actor_referee_id → referees.id |

## TODO

- Definire eventuali policy RLS in una milestone dedicata.
- Definire eventuali RPC in una milestone dedicata.
- Definire eventuali Edge Functions in una milestone dedicata.
- Definire eventuali trigger di aggiornamento automatico `updated_at` solo se approvati in una milestone dedicata.
- Validare con dati reali eventuali indici aggiuntivi quando saranno noti i pattern di query applicativi.
