# ARCH-1 Demo Bootstrap — Infrastructure Design

## Scope

This document defines the official Demo Bootstrap infrastructure for ARCH-1. The bootstrap must make a fresh Codespace reproducible with one command, without bypassing application workflows.

Milestone 1 is documentation-only: it defines the target architecture, data contracts, script layout, operation order, verification strategy, and non-goals. It does not implement functional code.

## Non-negotiable constraints

The Demo Bootstrap must not:

- insert SQL records manually;
- populate database tables directly from scripts;
- copy files directly into photo storage;
- manually mutate `photo_subjects`;
- manually mutate `global_official_photos`;
- manually mutate `photo_versions`;
- manually mutate `season_registration_photos`.

Every demo photo must pass through the official application workflow:

```text
Authentication
↓
Federation Sync
↓
Upload Intent
↓
Upload Complete
↓
Federation Approval
↓
Verification
```

## Target one-command experience

The intended command is:

```bash
pnpm demo:bootstrap
```

The command must build a complete demo environment for Backend, Web, and Mobile consumers by using the public/backend application APIs only.

## Proposed architecture

```text
scripts/demo-bootstrap.mjs
        │
        ├── scripts/lib/demo-auth.mjs
        ├── scripts/lib/demo-api-client.mjs
        ├── scripts/lib/demo-federation-sync.mjs
        ├── scripts/lib/demo-photo-upload.mjs
        ├── scripts/lib/demo-approval.mjs
        ├── scripts/lib/demo-verification.mjs
        └── scripts/lib/demo-report.mjs

refcheckid-backend/demo/arch1-demo-manifest.json
refcheckid-backend/demo/assets/photos/**
```

### Bootstrap runner

The runner orchestrates the full workflow. It must be small and imperative: parse options, load manifest, authenticate, execute phases in order, then print a final report.

### Demo API client

The API client wraps `fetch` and must expose only official endpoints used by the app:

- `POST /api/v1/auth/login`;
- `POST /api/v1/federation-sync`;
- `POST /api/v1/photos/upload-intent`;
- `POST /api/v1/photos/uploads/:uploadId/complete`;
- `GET /api/v1/photo-approvals`;
- `POST /api/v1/photo-approvals/:approvalId/approve`;
- `GET /api/v1/players/:playerId/photo`;
- `GET /api/v1/staff-members/:staffMemberId/photo`;
- `GET /api/v1/registrations/:registrationId/season-photo`;
- optional manifest checks through `GET /api/v1/matches/:matchId/photo-manifest`.

### Demo manifest

The manifest is the deterministic source of truth for demo data. It should contain stable IDs and all non-photo domain entities needed by Federation Sync.

Proposed top-level shape:

```json
{
  "version": 1,
  "seasonId": "2026",
  "federation": {},
  "clubs": [],
  "referees": [],
  "players": [],
  "playerRegistrations": [],
  "staffMembers": [],
  "staffRegistrations": [],
  "matches": [],
  "photos": []
}
```

Each `photos[]` item should map one official subject to one local demo asset:

```json
{
  "subjectKind": "athlete",
  "subjectId": "stable-subject-id",
  "registrationId": "stable-registration-id",
  "federationId": "stable-federation-id",
  "clubId": "stable-club-id",
  "seasonId": "2026",
  "assetPath": "refcheckid-backend/demo/assets/photos/athletes/home-01.jpg"
}
```

### Demo photo assets

Photo assets must be committed demo files and must not be copied directly into storage. They are input files read by the bootstrap and submitted through Upload Intent and Upload Complete.

Proposed layout:

```text
refcheckid-backend/demo/assets/photos/
  athletes/
    home-01.jpg
    home-02.jpg
    away-01.jpg
    away-02.jpg
  staff/
    home-manager.jpg
    home-coach.jpg
    away-manager.jpg
    away-coach.jpg
```

### Verification reporter

The reporter must fail the command with a non-zero exit code when the environment is incomplete.

Minimum report sections:

- authentication results;
- Federation Sync counts;
- Upload Intent count;
- Upload Complete count;
- approvals discovered;
- approvals approved;
- player photo reads;
- staff photo reads;
- season registration photo reads;
- browser-safe URL checks;
- storage object existence checks;
- pending approval checks.


## Milestone 2 implementation baseline

Milestone 2 establishes `refcheckid-backend/demo/arch1-demo-manifest.json` as the deterministic Source of Truth for ARCH-1 demo data. Backend pilot match data and Web pilot roster data must derive from this manifest instead of duplicating names, IDs, seasons, registrations, and match identifiers in separate files.

The manifest owns:

- demo federation, club, referee, match, sheet, and report identifiers;
- player and staff subject identifiers;
- player and staff seasonal registration identifiers;
- roster metadata used by Manager Web fallback/demo screens;
- photo subject mappings and deterministic asset paths for later Upload Intent and Upload Complete milestones.

The asset directories under `refcheckid-backend/demo/assets/photos/` are reserved for committed demo input images. These files are bootstrap inputs only: later milestones must read them and submit them through official photo APIs, never copy them directly into runtime storage.


## Milestone 3 implementation baseline

Milestone 3 introduces the first executable bootstrap runner through `pnpm demo:bootstrap`. The runner performs manifest loading/validation, authenticates the official demo users, builds the Federation Sync payload from the manifest, submits it to `POST /api/v1/federation-sync`, and verifies returned counts.

Milestone 3 intentionally stops before any photo mutation. Upload Intent, Upload Complete, Approval, storage population, and photo verification remain assigned to later milestones.

The runner supports `--dry-run` for local validation without a running backend. Dry runs validate the manifest and show expected Federation Sync counts, but do not create application data.

## Operation order

1. Preflight:
   - validate base URL;
   - validate manifest shape;
   - validate demo image files exist;
   - validate duplicate IDs are absent;
   - validate subject/registration references are internally consistent.
2. Authentication:
   - login manager home;
   - login manager away;
   - login federation;
   - optionally login referee for future referee manifest checks.
3. Federation Sync:
   - send all non-photo entities from the manifest;
   - record sync counts;
   - fail if expected counts are not returned.
4. Photo upload intent:
   - for each manifest photo, compute SHA-256, MIME type, and size;
   - call Upload Intent with subject, registration, federation, season, and context.
5. Photo upload complete:
   - submit image bytes through the official upload completion workflow;
   - for local development, prefer `contentBase64` on Upload Complete when direct HTTP upload is unavailable;
   - record returned version and approval metadata.
6. Federation approval:
   - list pending approvals for the demo federation;
   - approve only approvals matching demo subjects/upload IDs;
   - fail if expected approvals are missing.
7. Verification:
   - read official player photos;
   - read official staff photos;
   - read season registration photos;
   - verify no demo photo is Missing;
   - verify URLs are browser-safe and not `file://`;
   - verify storage objects referenced by completed uploads exist;
   - verify no expected approval remains pending.
8. Final report:
   - print a deterministic summary;
   - emit optional JSON report for CI/Codespace diagnostics.

## Idempotency strategy

Milestone 1 defines a conservative idempotency strategy for the first implementation:

- Federation Sync may be safely rerun for deterministic entities.
- If a subject already has an active official photo and storage verifies successfully, the bootstrap may skip re-uploading that photo.
- If a subject has pending approval, the bootstrap should approve it if it belongs to the demo manifest.
- If database state and storage state disagree, the bootstrap must fail and recommend a fresh Codespace or a future official demo reset workflow.

A destructive reset is out of scope for Milestone 1 and must not be implemented by direct SQL/table mutations.

## Commands to introduce in later milestones

Planned root scripts:

```json
{
  "demo:bootstrap": "node scripts/demo-bootstrap.mjs",
  "demo:verify": "node scripts/demo-verify.mjs",
  "demo:doctor": "node scripts/demo-doctor.mjs"
}
```

Milestone 1 does not add these commands yet unless the project owner explicitly moves to implementation milestones.

## Verification policy

The final bootstrap must verify both logical state and physical state.

Logical checks:

- every demo player has an official photo;
- every demo staff member has an official photo;
- every demo registration has a valid season registration photo;
- every expected approval has been approved;
- no demo photo URL is `file://`.

Physical checks:

- every referenced original object exists;
- every referenced normalized object exists;
- every object is non-empty;
- optional hash checks match the uploaded source asset where applicable.

## Milestone boundaries

### Milestone 1 — Infrastructure design

Documentation only. Defines structure, architecture, workflow, and progress tracking.

### Milestone 2 — Demo manifest

Defines deterministic dataset and resolves source-of-truth duplication between Web and Backend.

### Milestone 3 — Bootstrap runner

Implements authentication, manifest loading, Federation Sync, and orchestration shell.

### Milestone 4 — Official photo upload workflow

Implements Upload Intent and Upload Complete for demo images.

### Milestone 5 — Federation approval workflow

Implements approval discovery and automatic approval through official API endpoints.

### Milestone 6 — Verification and doctor

Implements API/storage/database verification and diagnostic reporting.

### Milestone 7 — Final integration

Connects Backend, Web, and Mobile demo expectations and validates the full environment.
