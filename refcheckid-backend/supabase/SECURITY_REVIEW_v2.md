# Supabase Security Review v2

**Versione:** v2.0  
**Stato:** Hardening TASK 008 completato  
**Ultimo aggiornamento:** 2026-06-30

## 1. Scopo

Questo documento riepiloga il hardening della Milestone 9 richiesto dal TASK 008.

Il lavoro corregge la sicurezza Supabase esistente senza modificare:

- migrazioni PostgreSQL della Milestone 8;
- Domain Model;
- Master Bible.

## 2. Modifiche applicate

| Area | Modifica |
| --- | --- |
| Platform admin | Aggiunta allowlist database `app_security.platform_admins` |
| Helper `is_platform_admin()` | Aggiornata per richiedere sia claim JWT `platform_admin` sia record database attivo |
| Audit logs | Aggiunte policy UPDATE/DELETE immutabili con `false` |
| Match reports | UPDATE ristretto a platform admin verificato da database |
| Match events | UPDATE ristretto a platform admin verificato da database |
| Recognitions | UPDATE ristretto a platform admin verificato da database |
| Match sheets | UPDATE/DELETE ristretti a platform admin verificato da database |
| Match sheet players | UPDATE/DELETE ristretti a platform admin verificato da database |
| Match sheet staff | UPDATE/DELETE ristretti a platform admin verificato da database |
| Photos | UPDATE/DELETE confermati solo per platform admin verificato da database |
| Identity documents | UPDATE ristretto a platform admin verificato da database; federation admin mantiene solo INSERT secondo policy esistente |
| Security roles doc | Aggiornato per documentare la doppia verifica JWT + database |

## 3. Platform admin verificato da database

La funzione `app_security.is_platform_admin()` non considera più sufficiente il solo claim JWT.

Un utente è platform admin solo se:

1. `auth.uid()` è valorizzato;
2. il JWT contiene ruolo `platform_admin`;
3. esiste una riga in `app_security.platform_admins` con `user_id = auth.uid()`;
4. la riga è `enabled = true`;
5. `disabled_at IS NULL`.

Questa scelta riduce il rischio di escalation tramite claim JWT errato o non aggiornato.

## 4. Immutable policy hardening

Le seguenti aree sono state irrigidite perché rappresentano dati operativi, riconoscimenti, referti, eventi, allegati sensibili o audit:

| Area | Prima | Dopo |
| --- | --- | --- |
| `audit_logs` | Nessuna policy UPDATE/DELETE esplicita | Policy UPDATE/DELETE esplicite con `false` |
| `match_reports` | UPDATE consentito al referee associato | UPDATE solo platform admin |
| `match_events` | UPDATE consentito a chi accede al match | UPDATE solo platform admin |
| `recognitions` | UPDATE consentito al referee associato | UPDATE solo platform admin |
| `match_sheets` | UPDATE/DELETE consentiti al club manager | UPDATE/DELETE solo platform admin |
| `match_sheet_players` | UPDATE/DELETE consentiti a chi accede alla distinta | UPDATE/DELETE solo platform admin |
| `match_sheet_staff` | UPDATE/DELETE consentiti a chi accede alla distinta | UPDATE/DELETE solo platform admin |
| `identity_documents` | UPDATE consentito anche a federation admin | UPDATE solo platform admin |

## 5. Principle of Least Privilege

Il modello v2 riduce i privilegi mutativi sulle entità più sensibili:

- i ruoli operativi mantengono capacità di inserimento dove previsto;
- le modifiche successive su record sensibili richiedono platform admin verificato da database;
- i log audit restano immutabili a livello policy;
- `platform_admin` richiede doppia verifica JWT + allowlist database.

## 6. Privacy by Design

Il hardening protegge maggiormente:

- documenti di identità;
- foto e allegati;
- riconoscimenti;
- referti gara;
- eventi gara;
- distinte gara;
- audit log.

Ridurre UPDATE/DELETE sui dati sensibili limita alterazioni retroattive e riduce esposizione operativa accidentale.

## 7. File modificati

| File | Modifica |
| --- | --- |
| `functions/001_security_helpers.sql` | Aggiunta allowlist DB platform admin e aggiornata `is_platform_admin()` |
| `policies/001_rls_policies.sql` | Ristrette policy UPDATE/DELETE per entità immutabili o sensibili |
| `policies/003_security_roles.md` | Documentata verifica platform admin JWT + database |
| `SECURITY_REVIEW_v2.md` | Aggiunta review finale TASK 008 |

## 8. Esito finale

TASK 008 completato: la Milestone 9 è stata corretta con hardening platform admin e policy immutabili, producendo un nuovo commit dedicato.
