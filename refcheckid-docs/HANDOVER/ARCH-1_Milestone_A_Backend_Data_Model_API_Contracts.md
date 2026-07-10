# ARCH-1 — Milestone A Handover

**Scope:** Backend data model and API contracts only.  
**Status:** Implemented as backend foundations; client workflows remain unchanged.

## Files modified

- `refcheckid-backend/database/migrations/0018_create_arch1_photo_model.sql`
- `refcheckid-backend/src/domain/photo/types.ts`
- `refcheckid-backend/src/repositories/photos-repository.ts`
- `refcheckid-backend/src/services/photo-state-machine.ts`
- `refcheckid-backend/src/services/photo-object-store.ts`
- `refcheckid-backend/src/services/photo-service.ts`
- `refcheckid-backend/src/services/index.ts`
- `refcheckid-backend/src/config/application-container.ts`
- `refcheckid-backend/src/api/controllers.ts`
- `refcheckid-backend/src/api/router.ts`
- `refcheckid-backend/src/api/openapi.ts`
- `refcheckid-backend/tests/photo-architecture.test.ts`

## Migration created

Created `0018_create_arch1_photo_model.sql` as a non-destructive migration. It does not drop or mutate the legacy `photos` table.

Tables introduced:

- `photo_subjects`
- `global_official_photos`
- `photo_versions`
- `photo_approvals`
- `season_registration_photos`
- `match_sheet_photo_snapshots`
- `photo_access_grants`
- `photo_audit_events`
- `photo_sync_cursors`

## Implemented data model

The implemented model follows the approved ARCH-1 decisions:

- global photo subject identity can be reused across federations/disciplines;
- seasonal registration photo binding is explicit through `season_registration_photos`;
- immutable versions are represented by `photo_versions`;
- `ACTIVE → SUPERSEDED → ARCHIVED` is represented in both domain types and schema constraints;
- one active version per global official photo is enforced by a partial unique index;
- one pending approval per registration and season is enforced by a partial unique index;
- Frozen Match Snapshot references are stored in `match_sheet_photo_snapshots` with immutable version/hash/correlation metadata.

## Differences from ARCH-1

- `season_id` is implemented as `text` because the current backend uses season strings and does not yet expose a dedicated `seasons` table.
- `discipline_id` is present as nullable `uuid`, but no foreign key is added because the current backend does not yet expose a `disciplines` table.
- API endpoints are contract-first: some return `501`/contract metadata instead of running complete workflows.
- `PhotoObjectStore` is implemented as a stub adapter to avoid binding the domain to Supabase Storage or AWS SDK during Milestone A.

## Endpoint status

Implemented or stubbed in router/OpenAPI:

- `GET /api/v1/photos/subjects` — implemented list contract.
- `GET /api/v1/players/:id/photo` — defined, not operational.
- `GET /api/v1/registrations/:id/season-photo` — defined, not operational.
- `POST /api/v1/photos/upload-intent` — stubbed through `StubPhotoObjectStore`.
- `POST /api/v1/photos/uploads/:id/complete` — defined, not operational.
- `GET /api/v1/photo-approvals` — implemented list by federation query.
- `POST /api/v1/photo-approvals/:id/approve` — defined, not operational.
- `POST /api/v1/photo-approvals/:id/reject` — defined, not operational.
- `GET /api/v1/match-sheets/:id/photo-snapshots` — implemented list contract.
- `GET /api/v1/matches/:id/photo-manifest` — defined, not operational.
- `GET /api/v1/photos/audit` — implemented list contract.

## Tests added

`refcheckid-backend/tests/photo-architecture.test.ts` covers:

- migration schema/constraints and non-destruction of legacy `photos`;
- state machine transitions;
- one active global version;
- reuse of one photo version across multiple seasonal registrations;
- one pending approval per registration/season;
- immutable frozen match snapshots;
- authorization isolation for federation and manager scope violations.

## Residual risks

- Database migration SQL is validated by text-level tests and TypeScript contracts, not by applying it to a live PostgreSQL instance in this environment.
- Current auth context exposes roles and actor id only; club/federation/referee relationships are modeled at service boundary level and must be wired to real identity claims in a later milestone.
- Existing client workflows still use legacy/local photo behavior by design.
- Existing `photos` table remains legacy and is not yet bridged to ARCH-1 tables.

## Next milestone activities

- Implement operational upload completion and validation pipeline.
- Wire real RBAC claims to photo authorization policies.
- Implement approval commands and official photo read resolution.
- Implement match sheet closure snapshot creation in the backend workflow.
- Add live migration execution validation against PostgreSQL/Supabase.

## Milestone A.1 migration infrastructure update

Milestone A.1 adds the official migration workflow before Milestone B:

- canonical SQL migrations remain in `refcheckid-backend/database/migrations`;
- `pnpm migrate` is the official root command;
- `pnpm migrate:status` lists migrations and checksums;
- `pnpm -C refcheckid-backend migrate:dry-run` validates migrations without database access;
- the runner prepares a temporary Supabase CLI workdir and applies migrations with `supabase db push`;
- rollback remains forward-only by policy and is made explicit through `pnpm migrate:rollback`.
