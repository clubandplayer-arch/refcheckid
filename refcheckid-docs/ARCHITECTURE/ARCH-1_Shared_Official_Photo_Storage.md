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
- **Modello dati:** separazione tra `official_photos` per l'identità logica corrente del soggetto, `photo_versions` per ogni file/versione candidata o approvata, `photo_approvals` per il processo decisionale federale, `photo_audit_events` per audit immutabile e `photo_sync_cursors`/manifest per offline.
- **Regola cardine:** un tesserato può avere **una sola foto ufficiale attiva** alla volta; le versioni precedenti restano conservate per audit/retention ma non sono ufficiali.
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
2. **Separazione metadata/binario.** Il database governa identità, stato, audit, autorizzazioni, checksum e versioni; l'object store conserva solo oggetti immutabili.
3. **Versioni immutabili.** Ogni upload produce una nuova versione immutabile; approvare una versione aggiorna il puntatore ufficiale in transazione.
4. **Workflow federale esplicito.** La federazione decide approve/reject; società e manager non possono rendere ufficiale una sostituzione già esistente senza approvazione.
5. **Offline come cache, non archivio.** Manager Mobile e Arbitro possono conservare copie locali firmate/manifestate, ma non diventano source of truth.
6. **Audit-first.** Ogni upload, validazione, download critico, approvazione, rigetto, sostituzione e cancellazione logica produce evento audit correlabile.
7. **Privacy by default.** Bucket privati, URL firmati brevi, minimizzazione EXIF, retention controllata e accesso per ruolo/federazione/club.
8. **Provider portability.** L'applicazione non deve dipendere direttamente da API proprietarie del provider storage.

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
        │       ├── official_photos
        │       ├── photo_versions
        │       ├── photo_approvals
        │       ├── photo_audit_events
        │       └── photo_sync_cursors
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
  └─ replacement upload ───────► REPLACEMENT_PENDING
       ├─ approve ─────────────► OFFICIAL_ACTIVE(versione nuova, precedente archived)
       ├─ reject ──────────────► OFFICIAL_ACTIVE(versione precedente resta valida)
       └─ cancel/expire ───────► OFFICIAL_ACTIVE(versione precedente resta valida)
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
federations/{federationId}/subjects/{subjectType}/{subjectId}/versions/{photoVersionId}/original
federations/{federationId}/subjects/{subjectType}/{subjectId}/versions/{photoVersionId}/normalized.webp
federations/{federationId}/subjects/{subjectType}/{subjectId}/versions/{photoVersionId}/thumb_128.webp
federations/{federationId}/subjects/{subjectType}/{subjectId}/versions/{photoVersionId}/thumb_320.webp
```

Non includere nomi, cognomi o codici fiscali nella key.

## 6. Modello dati proposto

### 6.1 Entità principali

#### `official_photos`

Rappresenta il puntatore logico alla foto ufficiale attiva di un soggetto.

Campi principali:

- `id uuid pk`
- `federation_id uuid not null`
- `subject_type enum('player','staff_member','referee') not null`
- `subject_id uuid not null`
- `current_version_id uuid null`
- `status enum('missing','pending_first_approval','active','suspended','retired') not null`
- `last_approved_at timestamptz null`
- `last_changed_at timestamptz not null`
- `created_at`, `updated_at`, `deleted_at`
- unique parziale: `(federation_id, subject_type, subject_id) where deleted_at is null`

Nota: per il requisito attuale il focus è il tesserato; includere `staff_member` e `referee` rende il modello coerente con la tabella esistente e con evoluzioni future, ma le policy possono abilitare inizialmente solo `player`/`staff_member`.

#### `photo_versions`

Rappresenta ogni file candidato/approvato/rigettato.

Campi principali:

- `id uuid pk`
- `official_photo_id uuid not null`
- `version_number integer not null`
- `uploaded_by_user_id uuid not null`
- `uploaded_by_role text not null`
- `uploaded_by_club_id uuid null`
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
- `status enum('uploaded','validating','pending_approval','approved','rejected','superseded','quarantined','deleted') not null`
- `rejection_reason_code text null`
- `rejection_notes text null`
- `created_at`, `updated_at`
- unique: `(official_photo_id, version_number)`
- unique: `storage_original_key`

#### `photo_approvals`

Rappresenta la decisione federale su una versione.

Campi principali:

- `id uuid pk`
- `photo_version_id uuid not null`
- `federation_id uuid not null`
- `requested_by_user_id uuid not null`
- `requested_at timestamptz not null`
- `decided_by_user_id uuid null`
- `decided_at timestamptz null`
- `status enum('pending','approved','rejected','cancelled','expired') not null`
- `decision_reason_code text null`
- `decision_notes text null`
- `sla_due_at timestamptz null`

Vincolo: una sola approval `pending` per `official_photo_id` alla volta.

#### `photo_audit_events`

Audit append-only, correlabile con audit generale.

Campi principali:

- `id uuid pk`
- `correlation_id uuid not null`
- `actor_user_id uuid null`
- `actor_role text not null`
- `federation_id uuid not null`
- `official_photo_id uuid null`
- `photo_version_id uuid null`
- `event_type text not null`
- `payload jsonb not null`
- `ip_hash text null`
- `user_agent_hash text null`
- `created_at timestamptz not null`

#### `photo_sync_manifests` o endpoint materializzato

Non è necessariamente una tabella permanente; può essere vista/materialized view o risultato API. Deve includere:

- `subject_id`
- `subject_type`
- `current_version_id`
- `photo_etag`
- `rendition_keys`
- `updated_at`
- `deleted_or_invalidated`
- `download_url` firmato breve opzionale

### 6.2 Relazione con modello attuale

La tabella `photos` attuale può essere migrata in due modi:

1. rinominata/evoluta in `photo_versions` se i dati sono ancora limitati;
2. mantenuta come legacy e popolata in parallelo durante una fase di compatibilità.

La scelta raccomandata è creare nuove tabelle esplicite e lasciare `photos` come legacy adapter temporaneo, perché lo schema attuale ha semantica generica e non distingue ufficialità, approval e versioni.

## 7. API definitive

Tutte le API sono sotto `/api/v1`, richiedono Bearer auth e rispettano RBAC/RLS per federazione, società e ruolo.

### 7.1 Lettura foto ufficiale

| Metodo | Endpoint                               | Scopo                                                            | Ruoli                                                    |
| ------ | -------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/players/{playerId}/photo`            | Restituisce metadata e URL firmato della foto ufficiale corrente | manager club autorizzato, federazione, arbitro assegnato |
| `GET`  | `/staff-members/{staffMemberId}/photo` | Foto ufficiale staff                                             | manager/federazione/arbitro se in distinta               |
| `GET`  | `/referees/{refereeId}/photo`          | Foto arbitro se abilitata                                        | federazione, arbitro stesso                              |
| `GET`  | `/photos/{officialPhotoId}`            | Dettaglio logico foto ufficiale                                  | federazione/admin                                        |
| `GET`  | `/photos/{officialPhotoId}/versions`   | Storico versioni                                                 | federazione/admin; club solo proprie richieste           |
| `GET`  | `/photos/versions/{versionId}`         | Dettaglio versione                                               | ruoli autorizzati                                        |
| `GET`  | `/photos/versions/{versionId}/content` | Redirect o stream con signed URL                                 | ruoli autorizzati                                        |

Risposta tipo per `/players/{id}/photo`:

```json
{
  "subjectType": "player",
  "subjectId": "...",
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
  "purpose": "first_official_photo|replacement"
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

| Metodo | Endpoint                                      | Scopo                                                    |
| ------ | --------------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/photos/sync-manifest?scope=club&cursor=...` | Manifest incrementale per Manager Mobile                 |
| `GET`  | `/matches/{matchId}/photo-manifest`           | Manifest foto ufficiali per arbitro assegnato a una gara |
| `POST` | `/photos/sync-ack`                            | Ack client per osservabilità e debugging                 |
| `GET`  | `/photos/changes?since=...`                   | Feed cambiamenti per client e federazione                |

### 7.5 Admin, retention e audit

| Metodo   | Endpoint                                  | Scopo                                   |
| -------- | ----------------------------------------- | --------------------------------------- |
| `GET`    | `/photos/audit?subjectId=...`             | Audit foto soggetto                     |
| `POST`   | `/photos/versions/{versionId}/quarantine` | Quarantena manuale sicurezza            |
| `POST`   | `/photos/versions/{versionId}/restore`    | Restore controllato                     |
| `DELETE` | `/photos/versions/{versionId}`            | Cancellazione logica/GDPR se consentita |

## 8. Lifecycle completo

### 8.1 Stati versione

- `uploaded`: object ricevuto, non ancora verificato.
- `validating`: pipeline in corso.
- `invalid`: fallimento MIME, dimensione, decoding, policy volto, checksum, antivirus o formato.
- `pending_approval`: valida tecnicamente, attende federazione.
- `approved`: approvata; se corrente è collegata da `official_photos.current_version_id`.
- `rejected`: respinta dalla federazione.
- `superseded`: era ufficiale, ma è stata sostituita da versione nuova approvata.
- `quarantined`: sospesa per sicurezza o controllo privacy.
- `deleted`: cancellazione logica/retention.

### 8.2 Prima foto

1. Manager Web/Mobile seleziona/scatta foto.
2. Client esegue pre-check UX: tipo immagine, dimensione, crop, qualità minima.
3. Client chiama `POST /photos/upload-intent`.
4. Backend verifica autorizzazione: il manager può operare solo su tesserati della propria società/federazione.
5. Backend crea `official_photos` se assente con stato `pending_first_approval` o `missing` + intent.
6. Client carica il file su URL firmato.
7. Client chiama `complete` con checksum.
8. Backend verifica oggetto, dimensione, MIME reale, hash, decoding immagine, strip EXIF, normalizzazione e antivirus.
9. Se valida, crea `photo_versions.status=pending_approval` e `photo_approvals.status=pending`.
10. Federazione approva.
11. In una transazione:
    - `photo_approvals.status=approved`;
    - `photo_versions.status=approved`;
    - `official_photos.current_version_id=versionId`;
    - `official_photos.status=active`;
    - audit `photo.approved` e `photo.official_changed`.
12. Manifest offline e cache client ricevono nuova `photoEtag`.

### 8.3 Sostituzione

1. Esiste `official_photos.status=active` con `current_version_id=A`.
2. Manager carica nuova versione `B`.
3. `B` va in `pending_approval`; `A` resta ufficiale e visibile a tutti.
4. Fino alla decisione, arbitro e federazione operativa vedono `A`; la federazione approvatrice vede confronto `A` vs `B`.
5. Se approve:
   - `A.status=superseded`;
   - `B.status=approved`;
   - `current_version_id=B`;
   - invalidazione cache per `A`;
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
- **Tesserato trasferito:** la foto appartiene al tesserato; visibilità per club cambia secondo registrazione attiva. La federazione mantiene accesso storico.
- **Gara già scaricata offline:** arbitro usa ultima cache valida, ma all'apertura online deve verificare manifest e aggiornare se `photoEtag` diversa.
- **Foto sospesa/quarantena dopo approvazione:** `official_photos.status=suspended`; client mostra placeholder controllato e motivo operativo non sensibile.

## 9. Impatti sui client e workflow

### 9.1 Manager Web

Da modificare:

- rimuovere localStorage come archivio ufficiale;
- sostituire `saveManagerSubjectPhoto` con chiamate `upload-intent` + `complete` + polling/subscription stato richiesta;
- mostrare chiaramente stati `missing`, `pending`, `approved`, `rejected`, `suspended`;
- per sostituzione, continuare a mostrare la foto ufficiale corrente e una card separata con proposta pending;
- non incorporare base64 nelle distinte;
- inviare in distinta solo riferimenti a soggetto/versione ufficiale o lasciare che il backend risolva automaticamente.

### 9.2 Manager Mobile

Da modificare:

- upload offline come **draft locale non ufficiale**: quando offline il manager può preparare/croppare la foto e metterla in outbox;
- appena online, l'app crea intent e completa upload;
- cache locale indicizzata per `subjectId + photoEtag`;
- sincronizzazione incrementale per società/squadra;
- UI per conflitti: se esiste già pending o foto cambiata da altro dispositivo, chiedere conferma prima di inviare.

### 9.3 Federazione

Da modificare:

- coda centralizzata `photo_approvals`;
- confronto visuale tra foto corrente e proposta;
- filtri per società, competizione, rischio, SLA;
- reason code standardizzati per reject;
- audit decisionale completo;
- possibilità admin di quarantena/sospensione.

### 9.4 Arbitro

Da modificare:

- leggere sempre manifest foto ufficiali per la gara assegnata;
- prefetch online prima della gara;
- cache offline read-only con `photoEtag` e timestamp;
- nessun fallback arbitrario a dati locali se esiste manifest valido;
- se foto mancante/sospesa, visualizzare stato ufficiale e richiedere nota di riconoscimento secondo workflow.

## 10. Offline mobile e sincronizzazione

### 10.1 Manifest

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
      "officialPhotoId": "...",
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

### 10.2 Cache policy

- Chiave cache: `subjectType/subjectId/currentVersionId/rendition`.
- Validità operativa: fino a cambio `photoEtag` o revoca manifest.
- TTL URL firmati: minuti/ore; TTL file cache: definito da policy app, ma sempre invalidabile da manifest.
- L'arbitro deve scaricare tutte le foto della gara quando online; durante la gara offline usa l'ultimo manifest scaricato e registra timestamp.
- Manager Mobile sincronizza per squadra/club e aggiorna incrementale con cursor.

### 10.3 Conflitti

- Se upload outbox parte da `baseVersionId=A` ma il server ora ha `currentVersionId=B`, il backend risponde `409 Conflict` con dettagli.
- Il client propone: annulla draft, confronta con nuova ufficiale o invia comunque come replacement di `B`.
- Se esiste pending approval, il backend rifiuta seconda pending salvo ruolo federazione/admin.

## 11. Sicurezza, privacy e compliance

### 11.1 Validazione file

- Accettare solo JPEG/PNG/WebP in ingresso; normalizzare preferibilmente a WebP/JPEG controllato.
- Verificare MIME dichiarato, magic bytes e decoding reale.
- Limite iniziale raccomandato: 5 MB input, risoluzione minima configurabile, massimo pixel per evitare decompression bomb.
- Strip EXIF e metadata prima di generare la versione normalizzata.
- Calcolare SHA-256 sul file originale e sulla versione normalizzata.
- Calcolare perceptual hash per deduplicazione/segnalazione duplicati sospetti.
- Antivirus/anti-malware asincrono prima che la versione sia approvabile.

### 11.2 Autorizzazioni

- Manager società: upload per tesserati/staff della propria società e federazione; lettura proprie squadre e distinte autorizzate.
- Federazione: lettura e decisione su soggetti della propria federazione.
- Arbitro: lettura limitata alle gare assegnate e alla finestra operativa definita.
- Admin sistema: manutenzione, quarantena, audit; uso tracciato e minimo.

### 11.3 Signed URL

- Bucket sempre privato.
- URL firmati read con TTL breve e scope per rendition.
- Upload signed URL monouso o con scadenza breve.
- Non esporre key interne se non necessario; usare endpoint redirect/stream se serve maggiore controllo.

### 11.4 Audit e retention

- Audit append-only per ogni evento sensibile.
- Conservare versioni rigettate/superseded secondo policy federale e privacy.
- Supportare cancellazione logica e, dove richiesto, hard delete differita con tombstone audit.
- Non loggare URL firmati completi o dati biometrici sensibili nei log applicativi.

## 12. Performance

- Generare renditions: `thumb128`, `thumb320`, `normalized` e opzionalmente `webp/avif` responsive.
- CDN davanti all'object storage per renditions approvate; no CDN pubblico per originali non approvati.
- Lazy loading nei client web.
- Prefetch per arbitro su manifest gara.
- Sincronizzazione incrementale via cursor e `photoEtag`.
- Cache HTTP controllata: `ETag`, `Cache-Control private`, revoca via cambio versione.
- Evitare base64 in JSON: usare URL firmati o upload diretto.
- Processing asincrono con job queue per normalizzazione e AV, mantenendo API responsive.

## 13. Scalabilità

Per decine di federazioni, migliaia di società, centinaia di migliaia di tesserati e milioni di foto:

- partizionare o indicizzare per `federation_id`, `subject_type`, `subject_id`, `status`;
- oggetti immutabili e CDN riducono carico backend;
- manifest incrementali evitano full sync;
- lifecycle object storage gestisce cleanup di intent scaduti e versioni oltre retention;
- approval queue paginata e filtrata per federazione;
- idempotency key su upload/complete/approve per retry sicuri;
- workers scalabili orizzontalmente per image processing e antivirus;
- metriche: upload rate, validation failure rate, approval SLA, cache hit, manifest size, storage growth.

## 14. Backward compatibility e feature flag

### 14.1 Feature flag

- `photos.officialBackendRead`: i client leggono foto dal backend se disponibili.
- `photos.officialBackendUpload`: Manager usa upload intent invece di localStorage.
- `photos.federationApprovalQueue`: federazione decide da nuova coda backend.
- `photos.refereeManifest`: arbitro usa manifest foto gara.
- `photos.legacyLocalFallback`: fallback temporaneo verso manager-photo-store/cache attuali.
- `photos.dualWriteLegacy`: durante migrazione scrive sia nuovo backend sia store legacy ove necessario.

### 14.2 Test automatici da prevedere

- Unit: state machine foto, policy autorizzazioni, validazione MIME/hash/dimensione.
- Integration: upload intent → complete → pending → approve → official read.
- Regression: sostituzione pending non cambia foto ufficiale arbitro.
- Security: manager non può leggere/caricare foto di altro club; arbitro non può leggere gara non assegnata.
- Offline: manifest diff, invalidazione etag, cache stale, conflitto outbox.
- Performance: manifest gara grande, lista approvazioni, signed URL generation.
- Migration: import legacy idempotente e rollback.

## 15. Strategia di migrazione incrementale

### Fase 0 — Architecture baseline

- Approvare questo documento.
- Definire ADR su storage provider e adapter.
- Congelare nuovi usi di `manager-photo-store` come source of truth.

### Fase 1 — Backend foundations

- Aggiungere nuove tabelle e servizio foto ufficiali.
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

- Arbitro scarica manifest gara dal backend.
- Fallback locale solo se flag attivo e manifest non disponibile.
- Monitorare mismatch e cache stale.

### Fase 5 — Manager Mobile offline sync

- Outbox offline per upload draft.
- Cache ufficiale sincronizzata via manifest club/squadra.
- Gestione conflitti lato UX.

### Fase 6 — Decommission legacy

- Disabilitare `photos.legacyLocalFallback`.
- Rimuovere dipendenza da `manager-photo-store` come persistenza ufficiale.
- Eliminare fallback arbitro non governati da manifest.
- Mantenere solo cache locali derivate e testate.

## 16. Rischi e mitigazioni

| Rischio                           | Impatto                     | Mitigazione                                            |
| --------------------------------- | --------------------------- | ------------------------------------------------------ |
| Migrazione incompleta foto legacy | Foto mancanti in gara       | Dual read, report copertura, rollout per club          |
| URL firmati scaduti offline       | Immagini non visibili       | Cache file locale, manifest con download anticipato    |
| Upload grandi o malevoli          | Costi/performance/sicurezza | limiti, magic bytes, AV, decompression guard           |
| Conflitti multi-device            | Pending incoerenti          | vincolo una pending per soggetto, baseVersionId, 409   |
| Lock-in provider                  | Costi futuri                | adapter S3-compatible e test contrattuali              |
| Privacy/log leakage               | Compliance                  | niente PII nelle key, no signed URL nei log, retention |
| Approvazioni lente                | Operatività bloccata        | SLA, notifiche, coda filtrabile, escalation            |

## 17. Priorità tecniche

1. Modello dati e state machine ufficiale.
2. Adapter object storage privato con signed URL.
3. API upload/read/approval minime.
4. Audit e authorization policy.
5. Manifest offline per arbitro.
6. Migrazione legacy e feature flag.
7. Renditions/CDN/performance.
8. Hardening antivirus, dedupe avanzata e retention automatica.

## 18. Roadmap tecnica proposta

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

## 19. Decisioni aperte

1. Provider iniziale: Supabase Storage o S3-compatible dedicato.
2. Retention legale per versioni rigettate e superseded per ogni federazione.
3. Se la prima foto possa essere auto-approvata in federazioni pilota o debba sempre passare dalla federazione. La raccomandazione ARCH-1 è approvazione federale anche per la prima foto, per coerenza 1.0.
4. Livello di controllo automatico immagine volto/documento: fuori scope per MVP, ma il modello lascia spazio a validation reason e scoring.
5. Politica esatta finestre arbitro: quando un arbitro può scaricare foto prima/dopo una gara.

## 20. Conclusione

ARCH-1 deve trasformare le foto da dato locale e opportunistico a infrastruttura identitaria condivisa. La soluzione proposta introduce una source of truth backend, object storage privato, versioning immutabile, approvazione federale, audit completo, manifest offline e rollout progressivo con feature flag. Questa architettura è compatibile con l'attuale implementazione pilota ma la supera, preparando RefCheckID 1.0 a uso multi-federazione, mobile offline e scala nazionale.
