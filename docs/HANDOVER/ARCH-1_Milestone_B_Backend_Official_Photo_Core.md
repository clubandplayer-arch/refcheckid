# ARCH-1 Milestone B — Backend Official Photo Core

## Summary

Milestone B implements the backend core of the ARCH-1 Official Photo Service without changing the approved architecture. The implementation keeps application logic behind `PhotoObjectStore`, `PhotoPolicyEngine`, repositories, and the validation pipeline.

## File modificati

- `refcheckid-backend/src/services/photo-object-store.ts`
- `refcheckid-backend/src/services/photo-policy-engine.ts`
- `refcheckid-backend/src/services/photo-validation-pipeline.ts`
- `refcheckid-backend/src/services/photo-service.ts`
- `refcheckid-backend/src/services/index.ts`
- `refcheckid-backend/src/config/application-container.ts`
- `refcheckid-backend/src/api/controllers.ts`
- `refcheckid-backend/src/api/router.ts`
- `refcheckid-backend/tests/photo-milestone-b.test.ts`

## API implementate

- `POST /api/v1/photos/upload-intent`
- `POST /api/v1/photos/uploads/{uploadId}/complete`
- `GET /api/v1/players/{playerId}/photo`
- `GET /api/v1/registrations/{registrationId}/season-photo`
- `GET /api/v1/photos/versions/{id}`
- `GET /api/v1/photos/versions/{id}/content`

## Provider storage

The initial concrete provider is `LocalPhotoObjectStore`, a filesystem-backed object-store adapter used for development and automated tests. It implements the same `PhotoObjectStore` contract expected from the Supabase Storage adapter, including signed upload intent creation, uploaded-object confirmation, rendition registration, quarantine, controlled deletion, and signed read URL generation.

## Bucket utilizzati

Development objects are stored below `storage/refcheckid-photos-dev`, matching the ARCH-1 private bucket naming convention for the DEV environment.

## Pipeline implementata

The validation pipeline includes MIME validation, magic-bytes validation, size validation, image decoding for PNG/JPEG/WebP headers, EXIF stripping for JPEG APP1 segments, normalized-object generation, SHA-256, perceptual hash, and an antivirus placeholder status (`skipped`) with a stable interface boundary for a future scanner.

## Test eseguiti

- `pnpm --dir refcheckid-backend test -- photo-milestone-b.test.ts`
- `pnpm --dir refcheckid-backend typecheck`

## Eventuali migration aggiuntive

No additional migrations were added. The existing ARCH-1 photo model migration was sufficient for this implementation slice.

## Limitazioni note

- The concrete object-store adapter is local DEV storage; Supabase Storage can be introduced by replacing the adapter behind `PhotoObjectStore` without changing `PhotoService`.
- Antivirus integration is represented by the final interface/status boundary and currently returns `skipped` because no external scanner service is available in this milestone.
- Renditions are registered through the object-store contract; thumbnail generation workers remain outside Milestone B scope.

## Rischi residui

- Production-grade signed URL cryptography and Supabase-specific URL issuance must be provided by the Supabase adapter before production deployment.
- Full federation approval UI/workflow and offline manifests remain in later milestones.

## Milestone successiva

Do not start Milestone C until explicit approval. The next milestone should integrate the client workflows and/or production storage adapter as approved by project direction.
