# ARCH-1 — Shared Official Photo Storage

**Versione:** 1.0 draft architetturale  
**Stato:** Proposta da validare prima dell'implementazione  
**Data:** 2026-07-09  
**Ambito:** Backend, storage, API, sicurezza, workflow federazione, Manager Web, Manager Mobile, Arbitro, sincronizzazione offline, migrazione dai local store attuali.

## 1. Executive summary

RefCheckID 1.0 deve trattare la foto ufficiale come dato identitario centrale del tesserato, non come allegato della distinta o come dato locale di un client. L'architettura definitiva introduce quindi un **Official Photo Service** nel backend RefCheckID, con metadata transazionali nel database applicativo e file binari in object storage privato.

Decisione proposta:

- **Storage fisico:** object storage S3-compatible privato come target architetturale definitivo; Supabase Storage è accettabile come provider iniziale se configurato come bucket privato e se il codice applicativo resta isolato dietro un'interfaccia `PhotoObjectStore`. Il filesystem locale non deve essere usato per dati ufficiali.
- **Source of truth:** backend RefCheckID, non Manager Web, non Manager Mobile, non localStorage, non cache arbitro.
- **Modello dati:** separazione tra identità globale dell'atleta (`photo_subjects`), foto globale condivisibile (`global_official_photos`), legame stagionale con il tesseramento (`season_registration_photos`), versioni immutabili (`photo_versions`), approvazioni federali (`photo_approvals`), snapshot gara congelati (`match_sheet_photo_snapshots`) e audit immutabile.
- **Regola cardine:** l'atleta ha una foto ufficiale globale riusabile tra federazioni e discipline; ogni tesseramento stagionale punta alla versione valida per quella stagione/federazione, e ogni distinta chiusa congela la versione in uso.
- **Retention definitiva:** le foto sostituite non vengono eliminate: transitano `ACTIVE → SUPERSEDED → ARCHIVED`, mantenendo lo storico completo per audit salvo obblighi normativi di cancellazione definitiva.
- **Client:** tutti i client leggono la foto ufficiale dal backend. Il mobile mantiene solo una cache offline sincronizzata e invalidabile.

## 2. Contesto repository analizzato

L'implementazione attuale conferma che ARCH-1 è un'evoluzione architetturale e non una correzione bug:

- Il database backend ha già una tabella `photos`, ma oggi è un metadata store generico con owner alternativi (`player_id`, `staff_member_id`, `referee_id`, `match_id`, `match_report_id`) e stati solo `active`/`archived`; non modella workflow di approvazione, versione ufficiale corrente o sostituzioni.
- Il repository backend espone `PhotoRepository` come repository generico e include solo una query `listByMatch`, quindi non esiste ancora un servizio foto ufficiale centrato sul tesserato.
- Le API registrano `GET /api/v1/photos` ma non espongono upload intent, approvazione federale, foto ufficiale per player/staff/referee o manifest offline.
- Manager Web salva oggi override e richieste di approvazione in `localStorage` tramite `manager-photo-store`; una nuova foto senza foto precedente viene applicata subito localmente, mentre una sostituzione produce richiesta pending locale.
- L'interfaccia Manager mostra esplicitamente la nota pilota secondo cui le foto confermate sono salvate nel localStorage del dispositivo, confermando che il comportamento attuale è volutamente provvisorio.

## 3. Principi architetturali

1. **Backend as source of truth.** Ogni foto ufficiale valida è risolta dal backend tramite metadata persistenti e file in object storage privato.
2. **Foto globale, validità stagionale.** Il binario e la versione ufficiale appartengono all'identità globale del tesserato/atleta; l'utilizzo operativo appartiene al tesseramento della stagione sportiva e alla federazione/disciplina che lo abilita.
3. **Riutilizzo multi-federazione.** Lo stesso atleta può essere tesserato presso più federazioni o discipline senza duplicare la foto: i tesseramenti stagionali referenziano la stessa `photo_version` quando policy e approvazioni lo consentono.
4. **Frozen Match Snapshot.** Alla chiusura della distinta, RefCheckID salva uno snapshot immutabile della versione foto usata per ogni tesserato; approvazioni successive non modificano distinte già chiuse.
5. **Separazione metadata/binario.** Il database governa identità, stato, audit, autorizzazioni, checksum e versioni; l'object store conserva solo oggetti immutabili.
6. **Versioni immutabili.** Ogni upload produce una nuova versione immutabile; approvare una versione aggiorna il puntatore ufficiale in transazione.
7. **Workflow federale esplicito.** La federazione decide approve/reject; società e manager non possono rendere ufficiale una sostituzione già esistente senza approvazione.
8. **Offline come cache, non archivio.** Manager Mobile e Arbitro possono conservare copie locali firmate/manifestate, ma non diventano source of truth.
9. **Audit-first.** Ogni upload, validazione, download critico, approvazione, rigetto, sostituzione e cancellazione logica produce evento audit correlabile.
10. **Privacy by default.** Bucket privati, URL firmati brevi, minimizzazione EXIF, retention controllata e accesso per ruolo/federazione/club.
11. **Provider portability.** L'applicazione non deve dipendere direttamente da API proprietarie del provider storage.

## 4. Diagrammi logici testuali

### 4.1 Vista componenti

```text
Manager Web / Manager Mobile
        │ upload-intent, submit, status, manifest
        ▼
RefCheckID API Gateway + Auth/RBAC
        │
        ▼
Official Photo Service
        ├── Photo Policy Engine
        ├── Photo Validation Pipeline
        ├── Photo Approval Workflow
        ├── Photo Manifest / Offline Sync
        ├── Photo Rendition Worker
        └── Audit Event Writer
        │
        ├── PostgreSQL metadata
        │       ├── photo_subjects
        │       ├── global_official_photos
        │       ├── season_registration_photos
        │       ├── photo_versions / photo_approvals
        │       ├── match_sheet_photo_snapshots
        │       └── photo_audit_events / sync manifests
        │
        └── Private Object Storage
                ├── originals immutable
                ├── normalized images
                └── thumbnails / responsive renditions
```

### 4.2 Vista consumo foto ufficiale

```text
Federazione UI ───────┐
Arbitro Web/Mobile ───┼── GET /players/{id}/photo ──► Backend ──► signed URL / bytes / manifest
Manager Web/Mobile ───┘

Nessun client legge da archivi ufficiali locali.
Le cache locali sono derivate, versionate e invalidabili.
```

### 4.3 Vista lifecycle sintetica

```text
NO_OFFICIAL_PHOTO
  └─ club upload validato ─► PENDING_APPROVAL
       ├─ federation approve ─► OFFICIAL_ACTIVE
       ├─ federation reject ───► REJECTED_NO_OFFICIAL
       └─ validation fail ─────► INVALID_UPLOAD

OFFICIAL_ACTIVE
  ├─ linked to season registration ─► SEASON_REGISTRATION_VALID
  ├─ match sheet closed ────────────► FROZEN_MATCH_SNAPSHOT(versione immutabile)
  └─ replacement upload ────────────► REPLACEMENT_PENDING
       ├─ approve ─────────────────► ACTIVE(nuova versione) + SUPERSEDED(vecchia)
       ├─ reject ──────────────────► ACTIVE(versione precedente resta valida)
       ├─ archive by retention ─────► ARCHIVED(versioni superseded storiche)
       └─ cancel/expire ───────────► ACTIVE(versione precedente resta valida)
```

## 5. Storage fisico: valutazione e scelta

### 5.1 Opzioni

| Opzione                        | Pro                                                                                   | Contro                                                                                                                | Valutazione                          |
| ------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Supabase Storage               | Integrato con stack Supabase/Postgres/RLS; rapido per MVP; signed URL già disponibili | Lock-in operativo; limiti/semantiche specifiche; meno ideale se domani servono multi-region/CDN avanzati indipendenti | Buona scelta iniziale se incapsulata |
| S3-compatible Object Storage   | Standard de facto; scalabile; lifecycle policy; versioning; CDN; multi-provider       | Richiede configurazione IAM, bucket policy, scanning pipeline                                                         | Scelta target definitiva             |
| Object Storage generico non S3 | Può soddisfare requisiti cloud specifici                                              | Portabilità inferiore se API proprietarie                                                                             | Accettabile solo dietro adapter      |
| Filesystem locale              | Semplice in sviluppo                                                                  | Non scalabile, fragile, difficile da replicare/CDN/backup, non adatto a serverless                                    | Non ammesso per foto ufficiali       |
| Database bytea/blob            | Transazioni semplici                                                                  | Appesantisce DB, backup costosi, performance peggiori per delivery immagini                                           | Non raccomandato                     |

### 5.2 Decisione

Usare **object storage S3-compatible privato** come architettura definitiva. Se RefCheckID resta su Supabase nella fase iniziale, Supabase Storage può essere il provider concreto, ma il dominio deve dipendere da un'interfaccia applicativa:

```text
PhotoObjectStore
  createUploadIntent(key, mime, size, checksum)
  confirmUploadedObject(key, checksum)
  createSignedReadUrl(key, rendition, ttl, disposition)
  deleteOrQuarantineObject(key)
  copyObjectForRendition(source, target)
```

Motivazione:

- milioni di fotografie richiedono storage economico, durevole e con lifecycle policy;
- le immagini sono binari immutabili, quindi object storage è più adatto del DB;
- CDN, signed URL, thumbnails e responsive renditions sono pattern nativi dell'object storage;
- un adapter impedisce che il dominio dipenda da Supabase/S3 specifici.

### 5.3 Bucket e naming

Bucket privati separati per ambiente:

```text
refcheckid-photos-prod
refcheckid-photos-staging
refcheckid-photos-dev
```

Key immutabile proposta:

```text
subjects/{globalSubjectId}/versions/{photoVersionId}/original
subjects/{globalSubjectId}/versions/{photoVersionId}/normalized.webp
subjects/{globalSubjectId}/versions/{photoVersionId}/thumb_128.webp
subjects/{globalSubjectId}/versions/{photoVersionId}/thumb_320.webp
```

Non includere nomi, cognomi o codici fiscali nella key.

## 6. Modello dati proposto

### 6.1 Decisione definitiva: foto globale, uso stagionale

La foto ufficiale non è più modellata come proprietà isolata di una distinta o come record locale di una singola federazione. Il modello definitivo separa quattro livelli:

1. **Identità globale del soggetto:** rappresenta l'atleta/tesserato come persona tecnica deduplicata nel dominio RefCheckID.
2. **Foto globale e versioni:** conserva le versioni immutabili della foto, riutilizzabili tra federazioni e discipline.
3. **Tesseramento stagionale:** collega una federazione/disciplina/stagione a una specifica versione foto ammessa per quel tesseramento.
4. **Snapshot gara:** congela la versione foto in uso quando una distinta viene chiusa.

Questa separazione permette a un atleta tesserato contemporaneamente in più federazioni di usare la stessa foto senza duplicare file, hash, approvazioni tecniche e renditions. Le federazioni mantengono comunque controllo autorizzativo e decisionale sull'uso della foto nei propri tesseramenti stagionali.

### 6.2 Entità principali

#### `photo_subjects`

Rappresenta l'identità globale deduplicata del soggetto fotografabile.

Campi principali:

- `id uuid pk`
- `subject_kind enum('athlete','staff_member','referee') not null`
- `canonical_person_id uuid null`
- `dedupe_key_hash text null`
- `created_at`, `updated_at`, `deleted_at`

Nota: la deduplicazione deve essere prudente e governata; non deve esporre dati personali sensibili né fondere identità senza controlli federali/amministrativi.

#### `global_official_photos`

Rappresenta il puntatore globale alla versione foto attualmente ufficiale per il soggetto.

Campi principali:

- `id uuid pk`
- `photo_subject_id uuid not null`
- `current_version_id uuid null`
- `status enum('missing','pending_first_approval','active','suspended','retired') not null`
- `last_approved_at timestamptz null`
- `last_changed_at timestamptz not null`
- `created_at`, `updated_at`, `deleted_at`
- unique parziale: `(photo_subject_id) where deleted_at is null`

Questa entità è globale: non contiene `federation_id` perché il file ufficiale può essere condiviso. Le autorizzazioni restano filtrate dai tesseramenti stagionali e dalle relazioni federali.

#### `season_registration_photos`

Collega la foto globale al tesseramento della stagione sportiva. È l'entità che risponde alla decisione definitiva: la foto ufficiale operativa appartiene al ciclo stagionale del tesseramento.

Campi principali:

- `id uuid pk`
- `federation_id uuid not null`
- `discipline_id uuid null`
- `season_id uuid not null`
- `registration_id uuid not null`
- `photo_subject_id uuid not null`
- `global_official_photo_id uuid not null`
- `effective_version_id uuid not null`
- `approval_id uuid null`
- `status enum('pending','valid','suspended','expired','revoked') not null`
- `valid_from timestamptz not null`
- `valid_until timestamptz null`
- `created_at`, `updated_at`, `deleted_at`
- unique parziale: `(registration_id, season_id) where deleted_at is null`

Ogni tesseramento stagionale ha una sola versione foto efficace alla volta. Più tesseramenti, anche di federazioni diverse, possono puntare alla stessa `effective_version_id` se la foto globale è valida e autorizzata per quei contesti.

#### `photo_versions`

Rappresenta ogni file candidato/approvato/rigettato. Le versioni sono immutabili e non vengono sovrascritte.

Campi principali:

- `id uuid pk`
- `global_official_photo_id uuid not null`
- `version_number integer not null`
- `uploaded_by_user_id uuid not null`
- `uploaded_by_role text not null`
- `uploaded_by_club_id uuid null`
- `origin_federation_id uuid null`
- `origin_season_id uuid null`
- `storage_original_key text not null`
- `storage_normalized_key text null`
- `mime_type text not null`
- `normalized_mime_type text null`
- `file_size_bytes bigint not null`
- `width integer null`
- `height integer null`
- `sha256 text not null`
- `perceptual_hash text null`
- `exif_stripped boolean not null default false`
- `av_scan_status enum('pending','clean','infected','failed','skipped') not null`
- `validation_status enum('pending','valid','invalid') not null`
- `status enum('uploaded','validating','pending_approval','active','rejected','superseded','archived','quarantined','erasure_pending','erased') not null`
- `activated_at timestamptz null`
- `superseded_at timestamptz null`
- `archived_at timestamptz null`
- `rejection_reason_code text null`
- `rejection_notes text null`
- `created_at`, `updated_at`
- unique: `(global_official_photo_id, version_number)`
- unique: `storage_original_key`

#### `photo_approvals`

Rappresenta la decisione federale sull'uso di una versione in uno o più tesseramenti stagionali.

Campi principali:

- `id uuid pk`
- `photo_version_id uuid not null`
- `federation_id uuid not null`
- `discipline_id uuid null`
- `season_id uuid not null`
- `registration_id uuid null`
- `requested_by_user_id uuid not null`
- `requested_at timestamptz not null`
- `decided_by_user_id uuid null`
- `decided_at timestamptz null`
- `status enum('pending','approved','rejected','cancelled','expired') not null`
- `decision_reason_code text null`
- `decision_notes text null`
- `scope enum('single_registration','federation_season','global_reuse') not null`
- `sla_due_at timestamptz null`

Vincoli:

- una sola approval `pending` per `registration_id + season_id`;
- una nuova approval può riusare una `photo_version` già approvata tecnicamente da un'altra federazione, ma la federazione ricevente può richiedere validazione/decisione propria prima di renderla efficace nel proprio tesseramento.

#### `match_sheet_photo_snapshots`

Congela la foto usata in una distinta chiusa.

Campi principali:

- `id uuid pk`
- `match_sheet_id uuid not null`
- `match_id uuid not null`
- `registration_id uuid not null`
- `season_registration_photo_id uuid not null`
- `photo_subject_id uuid not null`
- `photo_version_id uuid not null`
- `photo_etag text not null`
- `rendition_manifest jsonb not null`
- `frozen_at timestamptz not null`
- `frozen_by_user_id uuid not null`
- unique: `(match_sheet_id, registration_id)`

Lo snapshot non copia il file binario: salva il riferimento immutabile alla versione e i metadata necessari a ricostruire cosa l'arbitro doveva vedere al momento della chiusura distinta.

#### `photo_access_grants`

Rappresenta autorizzazioni temporanee o contestuali per leggere una foto.

Campi principali:

- `id uuid pk`
- `photo_version_id uuid not null`
- `grantee_type enum('user','role','club','federation','match_assignment') not null`
- `grantee_id uuid not null`
- `scope text not null`
- `expires_at timestamptz not null`
- `revoked_at timestamptz null`
- `created_at timestamptz not null`

#### `photo_audit_events`

Audit append-only, correlabile con audit generale.

Campi principali:

- `id uuid pk`
- `correlation_id uuid not null`
- `actor_user_id uuid null`
- `actor_role text not null`
- `federation_id uuid null`
- `season_id uuid null`
- `registration_id uuid null`
- `photo_subject_id uuid null`
- `photo_version_id uuid null`
- `event_type text not null`
- `payload jsonb not null`
- `ip_hash text null`
- `user_agent_hash text null`
- `created_at timestamptz not null`

#### `photo_sync_manifests` o endpoint materializzato

Non è necessariamente una tabella permanente; può essere vista/materialized view o risultato API. Deve includere:

- `registration_id`
- `season_id`
- `photo_subject_id`
- `current_version_id`
- `photo_etag`
- `snapshot_version_id` quando il contesto è una distinta chiusa
- `rendition_keys`
- `updated_at`
- `deleted_or_invalidated`
- `download_url` firmato breve opzionale

### 6.3 Relazione con modello attuale

La tabella `photos` attuale può essere migrata in due modi:

1. rinominata/evoluta in `photo_versions` se i dati sono ancora limitati;
2. mantenuta come legacy e popolata in parallelo durante una fase di compatibilità.

La scelta raccomandata è creare nuove tabelle esplicite e lasciare `photos` come legacy adapter temporaneo, perché lo schema attuale ha semantica generica e non distingue identità globale, tesseramento stagionale, approval, snapshot gara e retention `ACTIVE → SUPERSEDED → ARCHIVED`.

## 7. API definitive

Tutte le API sono sotto `/api/v1`, richiedono Bearer auth e rispettano RBAC/RLS per federazione, società e ruolo.

### 7.1 Lettura foto ufficiale

| Metodo | Endpoint                                       | Scopo                                                                                                       | Ruoli                                                    |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/players/{playerId}/photo`                    | Restituisce metadata e URL firmato della foto ufficiale corrente risolta dal tesseramento stagionale attivo | manager club autorizzato, federazione, arbitro assegnato |
| `GET`  | `/staff-members/{staffMemberId}/photo`         | Foto ufficiale staff                                                                                        | manager/federazione/arbitro se in distinta               |
| `GET`  | `/referees/{refereeId}/photo`                  | Foto arbitro se abilitata                                                                                   | federazione, arbitro stesso                              |
| `GET`  | `/photos/{officialPhotoId}`                    | Dettaglio logico foto ufficiale                                                                             | federazione/admin                                        |
| `GET`  | `/photos/{officialPhotoId}/versions`           | Storico versioni                                                                                            | federazione/admin; club solo proprie richieste           |
| `GET`  | `/photos/versions/{versionId}`                 | Dettaglio versione                                                                                          | ruoli autorizzati                                        |
| `GET`  | `/photos/versions/{versionId}/content`         | Redirect o stream con signed URL                                                                            | ruoli autorizzati                                        |
| `GET`  | `/registrations/{registrationId}/season-photo` | Foto efficace per il tesseramento nella stagione sportiva                                                   | manager club, federazione, arbitro se in distinta        |
| `GET`  | `/match-sheets/{matchSheetId}/photo-snapshots` | Versioni foto congelate alla chiusura della distinta                                                        | federazione, arbitro assegnato, club coinvolti           |

Risposta tipo per `/players/{id}/photo`:

```json
{
  "subjectType": "player",
  "subjectId": "...",
  "registrationId": "...",
  "seasonId": "...",
  "status": "active",
  "currentVersionId": "...",
  "photoEtag": "sha256:...",
  "updatedAt": "2026-07-09T00:00:00Z",
  "renditions": {
    "thumb128": { "url": "https://...", "expiresAt": "..." },
    "thumb320": { "url": "https://...", "expiresAt": "..." },
    "normalized": { "url": "https://...", "expiresAt": "..." }
  }
}
```

### 7.2 Upload

| Metodo   | Endpoint                                        | Scopo                                                                   |
| -------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| `POST`   | `/photos/upload-intent`                         | Crea intent e URL firmato PUT/POST per upload diretto su object storage |
| `POST`   | `/photos/uploads/{uploadId}/complete`           | Conferma upload, verifica checksum e avvia validazione                  |
| `POST`   | `/players/{playerId}/photo-requests`            | Shortcut per creare richiesta prima foto/sostituzione                   |
| `POST`   | `/staff-members/{staffMemberId}/photo-requests` | Analogo staff                                                           |
| `GET`    | `/photo-requests/{requestId}`                   | Stato richiesta                                                         |
| `DELETE` | `/photo-requests/{requestId}`                   | Cancella richiesta pending se non ancora decisa                         |

`upload-intent` deve ricevere almeno:

```json
{
  "subjectType": "player",
  "subjectId": "...",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "fileSizeBytes": 123456,
  "sha256": "...",
  "purpose": "first_official_photo|replacement",
  "registrationId": "...",
  "seasonId": "...",
  "baseVersionId": "..."
}
```

### 7.3 Approvazione federazione

| Metodo  | Endpoint                                           | Scopo                         |
| ------- | -------------------------------------------------- | ----------------------------- |
| `GET`   | `/photo-approvals?status=pending&federationId=...` | Coda approvazioni federazione |
| `GET`   | `/photo-approvals/{approvalId}`                    | Dettaglio decisione           |
| `PATCH` | `/photo-approvals/{approvalId}`                    | Approva/rigetta/cancella      |
| `POST`  | `/photo-approvals/{approvalId}/approve`            | Comando esplicito approve     |
| `POST`  | `/photo-approvals/{approvalId}/reject`             | Comando esplicito reject      |

Preferenza: endpoint comando `approve/reject` per chiarezza audit, lasciando `PATCH` solo per metadati non decisionali.

### 7.4 Offline sync e invalidazione

| Metodo | Endpoint                                      | Scopo                                                                                                        |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/photos/sync-manifest?scope=club&cursor=...` | Manifest incrementale per Manager Mobile                                                                     |
| `GET`  | `/matches/{matchId}/photo-manifest`           | Manifest foto ufficiali per arbitro assegnato a una gara; se la distinta è chiusa usa gli snapshot congelati |
| `POST` | `/photos/sync-ack`                            | Ack client per osservabilità e debugging                                                                     |
| `GET`  | `/photos/changes?since=...`                   | Feed cambiamenti per client e federazione                                                                    |

### 7.5 Admin, retention e audit

| Metodo   | Endpoint                                  | Scopo                                                     |
| -------- | ----------------------------------------- | --------------------------------------------------------- |
| `GET`    | `/photos/audit?subjectId=...`             | Audit foto soggetto                                       |
| `POST`   | `/photos/versions/{versionId}/quarantine` | Quarantena manuale sicurezza                              |
| `POST`   | `/photos/versions/{versionId}/restore`    | Restore controllato                                       |
| `POST`   | `/photos/versions/{versionId}/archive`    | Archivia versione superseded secondo retention            |
| `DELETE` | `/photos/versions/{versionId}`            | Erasure definitiva solo per obbligo normativo documentato |

## 8. Lifecycle completo

### 8.1 Stati versione

- `uploaded`: object ricevuto, non ancora verificato.
- `validating`: pipeline in corso.
- `invalid`: fallimento MIME, dimensione, decoding, policy volto, checksum, antivirus o formato.
- `pending_approval`: valida tecnicamente, attende federazione.
- `active`: approvata e corrente per la foto globale o per almeno un tesseramento stagionale.
- `rejected`: respinta dalla federazione.
- `superseded`: era ufficiale, ma è stata sostituita da versione nuova approvata; resta disponibile per audit e snapshot storici.
- `archived`: versione superseded fuori uso operativo ma conservata secondo retention.
- `quarantined`: sospesa per sicurezza o controllo privacy.
- `erasure_pending`: in attesa di cancellazione definitiva per obbligo normativo.
- `erased`: cancellata definitivamente con tombstone audit, solo quando richiesto da norma o provvedimento valido.

### 8.2 Prima foto

1. Manager Web/Mobile seleziona/scatta foto.
2. Client esegue pre-check UX: tipo immagine, dimensione, crop, qualità minima.
3. Client chiama `POST /photos/upload-intent`.
4. Backend verifica autorizzazione: il manager può operare solo su tesserati della propria società/federazione.
5. Backend crea o risolve `photo_subjects` e `global_official_photos`; collega la richiesta al `season_registration_photos` del tesseramento stagionale.
6. Client carica il file su URL firmato.
7. Client chiama `complete` con checksum.
8. Backend verifica oggetto, dimensione, MIME reale, hash, decoding immagine, strip EXIF, normalizzazione e antivirus.
9. Se valida, crea `photo_versions.status=pending_approval` e `photo_approvals.status=pending` nello scope della federazione/stagione/tesseramento.
10. Federazione approva.
11. In una transazione:
    - `photo_approvals.status=approved`;
    - `photo_versions.status=active`;
    - `global_official_photos.current_version_id=versionId`;
    - `global_official_photos.status=active`;
    - `season_registration_photos.effective_version_id=versionId`;
    - `season_registration_photos.status=valid`;
    - audit `photo.approved` e `photo.official_changed`.
12. Manifest offline e cache client ricevono nuova `photoEtag`.

### 8.3 Sostituzione

1. Esiste `global_official_photos.status=active` con `current_version_id=A`, e uno o più `season_registration_photos.effective_version_id=A`.
2. Manager carica nuova versione `B`.
3. `B` va in `pending_approval`; `A` resta ufficiale e visibile a tutti.
4. Fino alla decisione, arbitro e federazione operativa vedono `A`; la federazione approvatrice vede confronto `A` vs `B`.
5. Se approve:
   - `A.status=superseded`;
   - `B.status=active`;
   - `global_official_photos.current_version_id=B`;
   - i tesseramenti stagionali applicabili puntano a `B` solo per nuove distinte o distinte non ancora chiuse;
   - invalidazione cache per contesti non congelati che usavano `A`;
   - manifest incrementale segnala `photoEtag` cambiato.
6. Se reject:
   - `B.status=rejected`;
   - `A` resta corrente;
   - richiesta chiusa con reason code e note.

### 8.4 Stati edge

- **Upload interrotto:** intent `expired`; object incompleto eliminato da lifecycle job.
- **Checksum mismatch:** versione `invalid`, object quarantena/eliminazione.
- **AV infected:** `quarantined`, notifica security/admin, nessun URL pubblico.
- **Due sostituzioni concorrenti:** consentire una sola pending per soggetto; seconda richiesta restituisce `409 Conflict` o sostituisce draft solo se la prima non è stata completata.
- **Tesserato trasferito:** la versione foto resta legata all'identità globale del tesserato; l'uso operativo e la visibilità cambiano in base ai tesseramenti stagionali attivi. La federazione mantiene accesso storico secondo policy e audit.
- **Gara già scaricata offline:** arbitro usa ultima cache valida, ma all'apertura online deve verificare manifest e aggiornare se `photoEtag` diversa.
- **Foto sospesa/quarantena dopo approvazione:** `global_official_photos.status=suspended` o grant revocato; client mostra placeholder controllato e motivo operativo non sensibile.
- **Stagione nuova:** il tesseramento della nuova stagione può riusare la versione globale corrente senza nuovo upload, ma può richiedere nuova approval federale secondo policy.
- **Multi-federazione:** una federazione può riusare una versione già attiva globalmente; l'accesso è concesso solo se esiste tesseramento/approval valida nel proprio dominio.

## 9. Frozen Match Snapshot

### 9.1 Regola definitiva

Quando una distinta viene chiusa o bloccata, RefCheckID congela la versione foto associata a ciascun tesserato presente nella distinta. Da quel momento la distinta storica non segue più il puntatore globale corrente. Una foto approvata dopo la chiusura diventa disponibile solo per distinte nuove o non ancora chiuse.

### 9.2 Momento di congelamento

Il congelamento avviene nella stessa transazione logica della chiusura distinta:

1. il backend risolve ogni riga distinta verso `season_registration_photos.effective_version_id`;
2. crea una riga `match_sheet_photo_snapshots` per ogni tesserato/staff incluso;
3. salva `photo_version_id`, `photo_etag`, rendition manifest e timestamp;
4. registra audit `match_sheet.photo_snapshot_frozen`;
5. restituisce all'arbitro e alla federazione un manifest basato sugli snapshot.

### 9.3 Effetti operativi

- La distinta chiusa è riproducibile anche anni dopo con le stesse foto viste al momento operativo.
- Le sostituzioni approvate successivamente non alterano riconoscimenti, report e audit già chiusi.
- Se una foto snapshot viene poi archiviata, il file resta disponibile perché lo stato `ARCHIVED` non implica cancellazione.
- Se una foto snapshot deve essere cancellata per obbligo normativo, lo snapshot mantiene tombstone, metadata minimi e audit dell'erasure senza servire il binario.
- L'arbitro offline riceve manifest snapshot quando la distinta è chiusa; prima della chiusura riceve manifest dinamico legato al tesseramento stagionale.

## 10. Impatti sui client e workflow

### 10.1 Manager Web

Da modificare:

- rimuovere localStorage come archivio ufficiale;
- sostituire `saveManagerSubjectPhoto` con chiamate `upload-intent` + `complete` + polling/subscription stato richiesta;
- mostrare chiaramente stati `missing`, `pending`, `approved`, `rejected`, `suspended`;
- per sostituzione, continuare a mostrare la foto ufficiale corrente e una card separata con proposta pending;
- non incorporare base64 nelle distinte;
- inviare in distinta riferimenti a tesseramento stagionale; alla chiusura il backend crea lo snapshot congelato della versione foto.

### 10.2 Manager Mobile

Da modificare:

- upload offline come **draft locale non ufficiale**: quando offline il manager può preparare/croppare la foto e metterla in outbox;
- appena online, l'app crea intent e completa upload;
- cache locale indicizzata per `registrationId + seasonId + photoVersionId + photoEtag`;
- sincronizzazione incrementale per società/squadra;
- UI per conflitti: se esiste già pending o foto cambiata da altro dispositivo, chiedere conferma prima di inviare.

### 10.3 Federazione

Da modificare:

- coda centralizzata `photo_approvals`;
- confronto visuale tra foto corrente e proposta;
- filtri per società, competizione, rischio, SLA;
- reason code standardizzati per reject;
- audit decisionale completo;
- possibilità admin di quarantena/sospensione.

### 10.4 Arbitro

Da modificare:

- leggere sempre manifest foto ufficiali per la gara assegnata, dinamico prima della chiusura distinta e snapshot dopo la chiusura;
- prefetch online prima della gara;
- cache offline read-only con `photoEtag` e timestamp;
- nessun fallback arbitrario a dati locali se esiste manifest valido;
- se foto mancante/sospesa, visualizzare stato ufficiale e richiedere nota di riconoscimento secondo workflow.

## 11. Offline mobile e sincronizzazione

### 11.1 Manifest

Ogni client offline scarica un manifest firmato:

```json
{
  "scope": "match:...|club:...",
  "cursor": "...",
  "generatedAt": "...",
  "items": [
    {
      "subjectType": "player",
      "subjectId": "...",
      "registrationId": "...",
      "seasonId": "...",
      "photoSubjectId": "...",
      "snapshotId": "...",
      "currentVersionId": "...",
      "photoEtag": "sha256:...",
      "status": "active",
      "updatedAt": "...",
      "renditions": { "thumb320": "signed-url" }
    }
  ],
  "deleted": [
    {
      "subjectType": "player",
      "subjectId": "...",
      "reason": "superseded|retired|revoked"
    }
  ]
}
```

### 11.2 Cache policy

- Chiave cache: `registrationId/seasonId/photoVersionId/rendition`; per distinte chiuse usare `matchSheetId/snapshotId/rendition`.
- Validità operativa: fino a cambio `photoEtag` o revoca manifest.
- TTL URL firmati: minuti/ore; TTL file cache: definito da policy app, ma sempre invalidabile da manifest.
- L'arbitro deve scaricare tutte le foto della gara quando online; durante la gara offline usa l'ultimo manifest scaricato e registra timestamp.
- Manager Mobile sincronizza per squadra/club e aggiorna incrementale con cursor.

### 11.3 Conflitti

- Se upload outbox parte da `baseVersionId=A` ma il tesseramento stagionale ora ha `effectiveVersionId=B`, il backend risponde `409 Conflict` con dettagli.
- Il client propone: annulla draft, confronta con nuova ufficiale o invia comunque come replacement di `B`.
- Se esiste pending approval, il backend rifiuta seconda pending salvo ruolo federazione/admin.

## 12. Sicurezza e compliance tecnica

### 12.1 Validazione file

- Accettare solo JPEG/PNG/WebP in ingresso; normalizzare preferibilmente a WebP/JPEG controllato.
- Verificare MIME dichiarato, magic bytes e decoding reale.
- Limite iniziale raccomandato: 5 MB input, risoluzione minima configurabile, massimo pixel per evitare decompression bomb.
- Strip EXIF e metadata prima di generare la versione normalizzata.
- Calcolare SHA-256 sul file originale e sulla versione normalizzata.
- Calcolare perceptual hash per deduplicazione/segnalazione duplicati sospetti.
- Antivirus/anti-malware asincrono prima che la versione sia approvabile.

### 12.2 Autorizzazioni tecniche

- Manager società: upload per tesserati/staff della propria società e federazione; lettura proprie squadre e distinte autorizzate.
- Federazione: lettura e decisione su soggetti della propria federazione.
- Arbitro: lettura limitata alle gare assegnate e alla finestra operativa definita.
- Admin sistema: manutenzione, quarantena, audit; uso tracciato e minimo.

### 12.3 Signed URL

- Bucket sempre privato.
- URL firmati read con TTL breve e scope per rendition.
- Upload signed URL monouso o con scadenza breve.
- Non esporre key interne se non necessario; usare endpoint redirect/stream se serve maggiore controllo.

### 12.4 Audit tecnico

- Audit append-only per ogni evento sensibile.
- Conservare versioni rigettate/superseded secondo policy federale e privacy.
- Supportare cancellazione logica e, dove richiesto, hard delete differita con tombstone audit.
- Non loggare URL firmati completi o dati biometrici sensibili nei log applicativi.

## 13. Privacy e matrice autorizzazioni

### 13.1 Principi privacy

- Le fotografie sono dati personali identificativi: accesso minimo, scopo esplicito, tracciamento e revoca sono obbligatori.
- Le key object storage non devono contenere PII; devono usare identificativi opachi globali.
- I client non ricevono mai accesso bucket diretto permanente: ricevono Signed URL brevi e contestuali.
- L'accesso alla foto globale è sempre mediato da un contesto legittimo: tesseramento stagionale, relazione club, incarico arbitro, coda approvazione o amministrazione auditata.

### 13.2 Matrice autorizzazioni

| Attore                    | Può visualizzare                                                      | Condizioni                                                                   | Signed URL                                                                               | Audit                                          |
| ------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Manager società           | Foto dei tesserati/staff della propria società                        | Registrazione attiva nella stagione, appartenenza club, ruolo manager valido | TTL 5-15 minuti per Web; fino a 24 ore solo per cache mobile cifrata dopo manifest       | Sempre per generazione URL e download manifest |
| Manager Mobile offline    | Cache foto della propria squadra                                      | Manifest sincronizzato prima dell'offline, device autorizzato, cache cifrata | URL usata solo per download iniziale; offline usa file cache locale                      | Ack sync e accessi critici al ritorno online   |
| Federazione               | Foto e proposte dei tesseramenti della propria federazione/disciplina | Scope federazione/stagione; include coda approval e storico decisionale      | TTL 5-15 minuti; watermarked preview opzionale per review                                | Sempre, incluse decisioni e confronto versioni |
| Arbitro                   | Foto dei soggetti presenti in gare assegnate                          | Incarico valido e finestra temporale gara; distinta aperta o snapshot chiuso | TTL 15-60 minuti per prefetch; cache offline fino a fine finestra gara o policy federale | Manifest, prefetch e visualizzazioni operative |
| Admin sistema             | Foto necessarie per supporto/security                                 | Ticket, motivo operativo, least privilege, sessione tracciata                | TTL massimo 5 minuti                                                                     | Sempre con motivo obbligatorio                 |
| Futuri client/API partner | Solo foto esplicitamente delegate                                     | Contratto, scope OAuth/API, policy federazione                               | TTL breve, rate limit, audience vincolata                                                | Sempre                                         |

### 13.3 Generazione Signed URL

La Signed URL viene generata solo dopo una decisione positiva del Photo Policy Engine:

1. autenticazione utente/sessione;
2. verifica ruolo e relazione con federazione/club/gara;
3. verifica stato versione (`active`, `superseded` se snapshot, `archived` se audit autorizzato);
4. verifica grant non revocato e finestra temporale;
5. scelta rendition minima necessaria;
6. emissione URL con TTL breve, audience/scopo, content disposition sicura e correlation id.

Durate raccomandate:

- preview web standard: 5-15 minuti;
- coda federazione: 5-15 minuti;
- arbitro pre-gara online: 15-60 minuti;
- mobile sync: URL breve per scaricare file in cache cifrata; non URL lunga permanente;
- admin/security: massimo 5 minuti.

### 13.4 Revoca accessi

- Revocare un grant impedisce nuove Signed URL immediatamente.
- Le URL già emesse scadono naturalmente entro TTL breve; per incidenti critici si ruota la signing key o si sposta l'oggetto in quarantena.
- Manifest offline può essere revocato tramite `revokedAt`, cursor di invalidazione e obbligo di re-sync alla prima connessione.
- Se un arbitro perde l'assegnazione gara, il manifest successivo rimuove le foto e la cache deve cancellarle secondo policy.

### 13.5 Tracciamento accessi

Eventi minimi:

- `photo.signed_url_issued`;
- `photo.manifest_generated`;
- `photo.manifest_acknowledged`;
- `photo.version_viewed_for_approval`;
- `photo.snapshot_served`;
- `photo.access_denied`;
- `photo.grant_revoked`.

I log devono contenere correlation id, attore, ruolo, scope, `photo_version_id`, contesto (`registration_id`, `match_id`, `match_sheet_id`) e motivo. Non devono contenere Signed URL complete, token, dati biometrici o PII non necessaria.

## 14. Retention e storico fotografico

### 14.1 Politica definitiva

Le fotografie non vengono eliminate dopo una sostituzione ordinaria. Il ciclo retention standard è:

```text
ACTIVE → SUPERSEDED → ARCHIVED
```

- `ACTIVE`: versione corrente globale o efficace per almeno un tesseramento stagionale non congelato/non scaduto.
- `SUPERSEDED`: versione sostituita da una nuova approvata; resta servibile per snapshot storici e audit.
- `ARCHIVED`: versione non più usata operativamente ma conservata in storage a costo ridotto secondo policy.

### 14.2 Cancellazione definitiva

La cancellazione definitiva è eccezionale e ammessa solo in presenza di obbligo normativo, provvedimento valido o policy privacy applicabile. In quel caso:

1. stato `erasure_pending`;
2. valutazione impatto su snapshot, report e audit;
3. cancellazione o crypto-shredding del binario;
4. conservazione di tombstone non identificativo con hash, motivazione, autorità richiedente e timestamp;
5. audit `photo.erased`.

### 14.3 Snapshot e retention

Gli snapshot gara hanno priorità audit: una foto `SUPERSEDED` o `ARCHIVED` referenziata da una distinta chiusa deve restare risolvibile. Se un'erasure normativa impone cancellazione, la distinta storica mostra placeholder legale con tombstone e motivazione auditabile, non una foto nuova.

## 15. Performance

- Generare renditions: `thumb128`, `thumb320`, `normalized` e opzionalmente `webp/avif` responsive.
- CDN davanti all'object storage per renditions approvate; no CDN pubblico per originali non approvati.
- Lazy loading nei client web.
- Prefetch per arbitro su manifest gara.
- Sincronizzazione incrementale via cursor e `photoEtag`.
- Cache HTTP controllata: `ETag`, `Cache-Control private`, revoca via cambio versione.
- Evitare base64 in JSON: usare URL firmati o upload diretto.
- Processing asincrono con job queue per normalizzazione e AV, mantenendo API responsive.

## 16. Scalabilità

Per decine di federazioni, migliaia di società, centinaia di migliaia di tesserati e milioni di foto:

- partizionare o indicizzare per `federation_id`, `subject_type`, `subject_id`, `status`;
- oggetti immutabili e CDN riducono carico backend;
- manifest incrementali evitano full sync;
- lifecycle object storage gestisce cleanup di intent scaduti e versioni oltre retention;
- approval queue paginata e filtrata per federazione;
- idempotency key su upload/complete/approve per retry sicuri;
- workers scalabili orizzontalmente per image processing e antivirus;
- metriche: upload rate, validation failure rate, approval SLA, cache hit, manifest size, storage growth.

## 17. Backward compatibility e feature flag

### 17.1 Feature flag

- `photos.officialBackendRead`: i client leggono foto dal backend se disponibili.
- `photos.officialBackendUpload`: Manager usa upload intent invece di localStorage.
- `photos.federationApprovalQueue`: federazione decide da nuova coda backend.
- `photos.refereeManifest`: arbitro usa manifest foto gara.
- `photos.frozenMatchSnapshot`: chiusura distinta crea `match_sheet_photo_snapshots`.
- `photos.globalSubjectReuse`: abilita riuso multi-federazione della stessa `photo_version`.
- `photos.legacyLocalFallback`: fallback temporaneo verso manager-photo-store/cache attuali.
- `photos.dualWriteLegacy`: durante migrazione scrive sia nuovo backend sia store legacy ove necessario.

### 17.2 Test automatici da prevedere

- Unit: state machine foto, policy autorizzazioni, validazione MIME/hash/dimensione.
- Integration: upload intent → complete → pending → approve → official read.
- Regression: sostituzione pending non cambia foto ufficiale arbitro né snapshot di distinte chiuse.
- Security: manager non può leggere/caricare foto di altro club; arbitro non può leggere gara non assegnata.
- Offline: manifest diff, invalidazione etag, cache stale, conflitto outbox, snapshot manifest.
- Performance: manifest gara grande, lista approvazioni, signed URL generation.
- Migration: import legacy idempotente e rollback; deduplicazione soggetti/foto multi-federazione.

## 18. Strategia di migrazione incrementale

### Fase 0 — Architecture baseline

- Approvare questo documento.
- Definire ADR su storage provider e adapter.
- Congelare nuovi usi di `manager-photo-store` come source of truth.

### Fase 1 — Backend foundations

- Aggiungere nuove tabelle e servizio foto ufficiali, includendo `photo_subjects`, `season_registration_photos` e snapshot distinta.
- Implementare adapter storage con provider iniziale Supabase Storage o S3-compatible.
- Introdurre API read-only e manifest senza cambiare UX.

### Fase 2 — Import legacy e dual read

- Importare foto esistenti da dati pilota/local store disponibili dove tecnicamente recuperabili.
- Se il backend non ha foto, mantenere fallback legacy controllato da flag.
- Aggiungere report di copertura: quanti tesserati hanno foto ufficiale backend.

### Fase 3 — Upload backend per Manager Web

- Abilitare upload intent per Manager Web su club pilota.
- Le sostituzioni diventano pending backend.
- Federazione usa nuova coda per approvazioni pilota.

### Fase 4 — Arbitro manifest

- Arbitro scarica manifest gara dal backend; dopo chiusura distinta il manifest è basato su Frozen Match Snapshot.
- Fallback locale solo se flag attivo e manifest non disponibile.
- Monitorare mismatch e cache stale.

### Fase 5 — Manager Mobile offline sync

- Outbox offline per upload draft.
- Cache ufficiale sincronizzata via manifest club/squadra.
- Gestione conflitti lato UX.

### Fase 6 — Decommission legacy

- Disabilitare `photos.legacyLocalFallback` dopo copertura snapshot e tesseramenti stagionali.
- Rimuovere dipendenza da `manager-photo-store` come persistenza ufficiale.
- Eliminare fallback arbitro non governati da manifest.
- Mantenere solo cache locali derivate e testate.

## 19. Rischi e mitigazioni

| Rischio                           | Impatto                     | Mitigazione                                            |
| --------------------------------- | --------------------------- | ------------------------------------------------------ |
| Migrazione incompleta foto legacy | Foto mancanti in gara       | Dual read, report copertura, rollout per club          |
| URL firmati scaduti offline       | Immagini non visibili       | Cache file locale, manifest con download anticipato    |
| Upload grandi o malevoli          | Costi/performance/sicurezza | limiti, magic bytes, AV, decompression guard           |
| Conflitti multi-device            | Pending incoerenti          | vincolo una pending per soggetto, baseVersionId, 409   |
| Lock-in provider                  | Costi futuri                | adapter S3-compatible e test contrattuali              |
| Privacy/log leakage               | Compliance                  | niente PII nelle key, no signed URL nei log, retention |
| Approvazioni lente                | Operatività bloccata        | SLA, notifiche, coda filtrabile, escalation            |

## 20. Priorità tecniche

1. Modello dati e state machine ufficiale.
2. Adapter object storage privato con signed URL.
3. API upload/read/approval minime.
4. Audit e authorization policy.
5. Manifest offline per arbitro.
6. Migrazione legacy e feature flag.
7. Renditions/CDN/performance.
8. Hardening antivirus, dedupe avanzata e retention automatica.

## 21. Roadmap tecnica proposta

```text
Milestone A — Design approval
  - ADR storage provider
  - schema dati definitivo
  - contratti API OpenAPI

Milestone B — Backend official photo core
  - tabelle + repository + service
  - upload intent + complete
  - approval commands
  - read official photo

Milestone C — Federation approval UX
  - queue pending
  - approve/reject
  - audit decisionale

Milestone D — Manager Web migration
  - upload backend
  - stato pending/rejected/approved
  - feature flag + dual read

Milestone E — Referee official manifest
  - match photo manifest
  - prefetch/cache
  - stale handling

Milestone F — Manager Mobile offline parity
  - cache sync
  - upload outbox
  - conflict handling

Milestone G — Legacy removal and scale hardening
  - remove local official stores
  - CDN/renditions
  - AV/retention/dedupe
  - performance and security test suite
```

## 22. Decisioni aperte

1. Provider iniziale: Supabase Storage o S3-compatible dedicato.
2. Durata di conservazione `ARCHIVED` per versioni rigettate e superseded per ogni federazione, nel rispetto della policy generale di non eliminazione ordinaria.
3. Livello di controllo automatico immagine volto/documento: fuori scope per MVP, ma il modello lascia spazio a validation reason e scoring.
4. Politica esatta finestre arbitro: quando un arbitro può scaricare foto prima/dopo una gara.
5. Policy federali per riuso automatico multi-federazione: approvazione automatica della foto globale o decisione esplicita per ogni federazione/stagione.

## 23. Conclusione

ARCH-1 deve trasformare le foto da dato locale e opportunistico a infrastruttura identitaria condivisa. La soluzione proposta introduce una source of truth backend, object storage privato, versioning immutabile, approvazione federale, audit completo, manifest offline e rollout progressivo con feature flag. Questa architettura è compatibile con l'attuale implementazione pilota ma la supera, preparando RefCheckID 1.0 a uso multi-federazione, mobile offline e scala nazionale.
