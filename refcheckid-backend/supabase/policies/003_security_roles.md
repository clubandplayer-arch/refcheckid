# Supabase Security Roles

**Versione:** v1.0  
**Stato:** Implementato  
**Ultimo aggiornamento:** 2026-06-29

## Ruoli applicativi

I ruoli sono letti dal JWT Supabase tramite `app_metadata.role` oppure dal claim `role`. Il ruolo `platform_admin` richiede anche una riga attiva nella allowlist database `app_security.platform_admins`.

| Ruolo | Scopo | Principio |
| --- | --- | --- |
| `platform_admin` | Amministrazione tecnica globale | Accesso massimo, riservato e verificato da database |
| `federation_admin` | Gestione dati della propria federazione | Accesso limitato a `federation_id` nel JWT |
| `club_admin` | Gestione dati del proprio club | Accesso limitato a `club_id` nel JWT |
| `referee` | Gestione operativa delle gare assegnate | Accesso limitato a `referee_id` nel JWT |
| `authenticated` | Utente autenticato senza ruolo applicativo elevato | Accesso minimo tramite policy esplicite |

## Claims richiesti

| Claim | Tipo | Uso |
| --- | --- | --- |
| `app_metadata.role` | text | Ruolo applicativo |
| `app_metadata.federation_id` | uuid | Scope federazione |
| `app_metadata.club_id` | uuid | Scope club |
| `app_metadata.referee_id` | uuid | Scope arbitro |

## Note operative

- Nessuna policy è definita per `anon`.
- `platform_admin` non è sufficiente come solo claim JWT: deve essere confermato da `app_security.platform_admins`.
- Le funzioni helper centralizzano il calcolo degli scope.
- Le policy applicano least privilege e privacy by design.
