# ARCH-1 Milestone C — Federation Approval Workflow

## Summary

Milestone C makes the Federation decision workflow operational on top of the Milestone B photo backend. Upload completion now leaves validated photo versions in `pending_approval` and creates a pending `photo_approvals` decision. Federation or Admin actors can approve or reject through `PhotoService`, which remains the only service that mutates photo lifecycle state.

## Files modified

- `refcheckid-backend/src/services/photo-service.ts` — approval/rejection commands, authorization, idempotency, lifecycle updates, and decision audit.
- `refcheckid-backend/src/api/controllers.ts` — approval queue filters, detail endpoint, approve endpoint, reject endpoint.
- `refcheckid-backend/src/api/router.ts` — `GET /api/v1/photo-approvals/:id` route.
- `refcheckid-backend/src/api/openapi.ts` — implemented approval workflow contracts.
- `refcheckid-backend/tests/photo-approval-milestone-c.test.ts` — Milestone C queue, authorization, audit, first-photo, replacement, reject, and idempotency tests.
- `refcheckid-web/src/lib/federation-api-client.ts` — Federation UI client calls for approval queue and decisions.
- `refcheckid-web/src/lib/federation-types.ts` — decision metadata on photo requests.
- `refcheckid-web/src/features/federation/federation-workflow.tsx` — Federation photo queue actions wired to backend approve/reject endpoints with reason code and notes.

## API implemented

- `GET /api/v1/photo-approvals`
  - Supports federation, status, season, registration, and requested date filters.
  - Returns chronological approval queue items.
- `GET /api/v1/photo-approvals/{id}`
  - Returns approval detail for the decision screen.
- `POST /api/v1/photo-approvals/{id}/approve`
  - Delegates lifecycle mutation to `PhotoService.approvePhotoApproval`.
  - Idempotent for already approved decisions.
- `POST /api/v1/photo-approvals/{id}/reject`
  - Delegates lifecycle mutation to `PhotoService.rejectPhotoApproval`.
  - Persists reason code and notes.
  - Idempotent for already rejected decisions.

## Workflow implemented

### First photo

`pending_first_approval` global photo + `pending_approval` version + pending approval becomes approved. Approval activates the proposed version, marks the global official photo active, and creates/updates the season registration photo.

### Replacement

An active version remains active while the proposed replacement is pending. Approval activates the proposed version, supersedes prior active versions, updates `GlobalOfficialPhoto`, and points `SeasonRegistrationPhoto` to the new version.

### Rejection

Rejecting a pending replacement marks only the proposed version rejected, persists reason code and notes, and leaves the old active version unchanged.

## UI introduced

The Federation photo area now loads approval requests from the backend approval queue, shows current and proposed photo comparison panels, and exposes Approve and Reject actions. Rejection includes reason code and operator notes, which are submitted to the backend decision endpoint.

## Tests

- Backend typecheck passes.
- Backend test suite passes: 23 files, 95 tests.
- Web typecheck passes.
- Milestone C tests cover approval queue, detail, approve, reject, authorization, audit, lifecycle updates, replacement workflow, first-photo workflow, and endpoint/service idempotency.

## Limitations

- No migration was added. The existing ARCH-1 photo schema already contains the required decision, reason, note, and audit fields.
- The UI displays backend decision records and falls back to existing local photo-request data if the approval endpoint is unavailable in a local web-only demo context.
- No Manager Web migration, Manager Mobile, referee manifest, frozen match snapshot operation, offline sync, or legacy removal was implemented.

## Next milestone

Milestone D must not start automatically. Proceed only after explicit approval.
