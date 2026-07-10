# ARCH-1 Milestone F — Manager Mobile Official Photo Migration

## Summary

Milestone F introduces the Manager Mobile ARCH-1 official photo layer. The mobile client now has a dedicated Official Photo Service that mirrors the validated Manager Web semantics: backend-first reads, Upload Intent, Upload Complete, backend photo states, temporary offline cache, prefetch, and legacy fallback only behind the existing ARCH-1 feature flag.

No backend, storage, migration, Manager Web, Referee Web, Federation Web, or API contracts were changed.

## Audit iniziale effettuato

### Source of Truth analizzate

- `refcheckid-docs/ARCHITECTURE/ARCH-1_Shared_Official_Photo_Storage.md`
- `refcheckid-web/src/lib/manager-photo-backend.ts`
- `refcheckid-web/src/lib/photo-feature-flags.ts`
- `refcheckid-web/src/features/manager/match-sheet-workflow.tsx`
- `refcheckid-web/tests/unit/manager-photo-backend.test.ts`
- `docs/HANDOVER/ARCH-1_Milestone_D_Manager_Web_Migration.md`
- `docs/HANDOVER/ARCH-1_Milestone_E_Referee_Web_Migration.md` quando presente nel workspace

### Componenti già compatibili

- I contratti backend ARCH-1 risultano già disponibili e invariati:
  - `GET /players/{playerId}/photo`
  - `GET /photo-approvals?registrationId=...`
  - `GET /photos/versions/{versionId}/content`
  - `POST /photos/upload-intent`
  - `POST /photos/uploads/{uploadId}/complete`
- I feature flag ARCH-1 già consolidati nel Web sono stati riutilizzati senza introdurre nuovi flag.
- La semantica degli stati `missing`, `pending`, `active`, `rejected`, `suspended` è stata mantenuta allineata al Manager Web.

### Componenti da migrare / introdotti

- Nuovo package workspace `refcheckid-mobile` come area Manager Mobile.
- Nuovo servizio mobile `OfficialPhotoService` per centralizzare lettura, upload, prefetch, cache e offline.
- Nuova cache mobile temporanea con storage adapter, compatibile con AsyncStorage o altri storage React Native tramite interfaccia.
- Nuovo mapper UI mobile per rappresentare gli stati backend senza ricalcolarli.

### Logiche legacy ancora presenti

- Il fallback legacy non è stato rimosso definitivamente perché out of scope.
- Il fallback legacy resta disponibile esclusivamente dietro `photos.legacyLocalFallback`, solo quando la lettura backend è disabilitata, offline senza cache, o fallisce senza cache valida.
- Il fallback non diventa Source of Truth e non viene scritto nel backend.

### Differenze funzionali individuate

- Il repository non conteneva un package mobile React Native precedente nel workspace corrente; per questo la milestone crea la base mobile isolata invece di modificare schermate React Native esistenti.
- La cache mobile è implementata come adapter astratto e testata con memoria locale; l'integrazione concreta con AsyncStorage può essere collegata dal runtime React Native senza cambiare la semantica ARCH-1.

### API obsolete / duplicazioni

- Non sono state aggiunte API obsolete.
- Non sono state introdotte nuove API.
- La duplicazione della logica Web è stata limitata al minimo necessario per adattare fetch, cache e offline al contesto mobile.

### Divergenze rispetto ad ARCH-1

- Nessuna divergenza intenzionale introdotta.
- Upload diretti verso storage sono consentiti solo tramite signed URL ottenuto da Upload Intent, quindi non bypassano Official Photo Service.
- Offline resta cache temporanea e non genera stati autonomi.

## File modificati

- `pnpm-workspace.yaml`
- `refcheckid-mobile/package.json`
- `refcheckid-mobile/tsconfig.json`
- `refcheckid-mobile/src/lib/photo-feature-flags.ts`
- `refcheckid-mobile/src/lib/official-photo-cache.ts`
- `refcheckid-mobile/src/lib/official-photo-service.ts`
- `refcheckid-mobile/src/lib/photo-state-ui.ts`
- `refcheckid-mobile/tests/unit/official-photo-service.test.ts`
- `docs/HANDOVER/ARCH-1_Milestone_F_Manager_Mobile_Official_Photo.md`

## Flusso migrato

1. Manager Mobile legge la foto ufficiale tramite `GET /players/{playerId}/photo`.
2. Se esiste una registrazione, legge l'ultima approval tramite `GET /photo-approvals?registrationId=...`.
3. Se l'approval contiene una versione proposta, legge il contenuto tramite `GET /photos/versions/{versionId}/content`.
4. Il servizio restituisce uno stato mobile basato esclusivamente su backend e approval backend.
5. Il risultato viene salvato nella cache temporanea con TTL.
6. Offline, il servizio usa solo cache valida; se non disponibile, può usare legacy fallback solo dietro feature flag esistente.
7. Upload usa `POST /photos/upload-intent`, eventuale signed upload, poi `POST /photos/uploads/{uploadId}/complete`.
8. Dopo Upload Complete, la cache del player viene invalidata e lo stato viene riletto dal backend.

## Componenti aggiornati

- Official Photo Service mobile:
  - backend-first read;
  - approval-state mapping;
  - proposed photo read;
  - upload intent;
  - upload complete;
  - prefetch;
  - offline cache read;
  - cache invalidation dopo upload.
- Cache mobile:
  - storage adapter asincrono;
  - implementazione memory per test;
  - TTL e invalidazione;
  - nessuna promozione a Source of Truth.
- UI state mapper:
  - `Missing`, `Pending`, `Active`, `Rejected`, `Suspended`;
  - nessuna ricostruzione autonoma degli stati.

## Feature Flag utilizzati

Solo feature flag ARCH-1 già esistenti:

- `photos.officialBackendRead`
- `photos.officialBackendUpload`
- `photos.refereeManifest`
- `photos.frozenMatchSnapshot`
- `photos.legacyLocalFallback`
- `photos.dualWriteLegacy`

Non sono stati introdotti nuovi feature flag.

## Eventuali bug backend individuati

Nessun bug backend individuato durante questa milestone.

## Test eseguiti

- `pnpm --filter refcheckid-mobile test:unit`
- `pnpm --filter refcheckid-mobile typecheck`

Nota: un tentativo di `pnpm install --lockfile-only` non è stato completato per errore registry `403 Forbidden` su `https://registry.npmjs.org/vitest`; non è una regressione del codice e non ha richiesto modifiche al lockfile.

## Limitazioni note

- Nel workspace corrente non era presente una codebase React Native preesistente; la milestone introduce quindi il layer mobile ufficiale e testato, pronto per essere collegato alle schermate Manager Mobile effettive.
- L'adapter concreto di storage React Native, ad esempio AsyncStorage, resta un wiring applicativo: l'interfaccia è già predisposta e non cambia la semantica ARCH-1.
- Il fallback legacy rimane temporaneamente disponibile perché la rimozione definitiva è fuori scope.

## Milestone successiva

Non iniziare automaticamente la Milestone G. La prossima milestone potrà migrare Referee Mobile solo dopo approvazione esplicita.
