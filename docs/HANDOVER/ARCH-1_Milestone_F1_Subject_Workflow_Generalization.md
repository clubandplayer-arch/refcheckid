# ARCH-1 Milestone F.1 — Subject Workflow Generalization (Staff Member)

## Summary

Milestone F.1 completes the approved ARCH-1 implementation by removing the remaining Player-only specializations from the official photo workflow. ARCH-1 itself is unchanged: the implementation now uses the existing `photo_subjects`, `global_official_photos`, `photo_versions`, `photo_approvals`, and `season_registration_photos` model for both athletes and staff members.

## Generalization performed

- Upload Intent now accepts subject-based input while keeping the legacy `playerId` request shape for backward compatibility.
- The Official Photo Service resolves or creates `photo_subjects` by `subjectKind + subjectId` and uses the same global official photo, upload, validation, versioning, approval, and audit flow for athletes and staff members.
- Upload Complete remains unchanged as the object-storage and validation completion step and continues to operate from the upload session and object key.
- Manager Web now enriches staff with backend photo state, uploads staff photos through the same official subject upload path, and displays the same backend status, current/proposed comparison, and pending proposal UX used for players.
- Federation approval remains a single queue backed by `photo_approvals`; staff requests appear in the same queue because they are created by the same upload completion path.
- Staff official read support is exposed through the ARCH-1 endpoint `/staff-members/{id}/photo` without introducing a parallel service or queue.

## Subject-based parts

- `PhotoService.createUploadIntent`
- Manager Web official upload client
- Manager Web backend photo state enrichment
- Staff photo read route/controller
- Upload approval creation and approval lifecycle reuse

## Contract changes and compatibility

`POST /photos/upload-intent` remains the canonical upload intent endpoint.

Backward-compatible player payloads are still accepted:

```json
{
  "playerId": "...",
  "registrationId": "...",
  "federationId": "...",
  "seasonId": "2026"
}
```

The generalized payload is now also accepted:

```json
{
  "subjectKind": "staff_member",
  "subjectId": "...",
  "staffMemberId": "...",
  "registrationId": "...",
  "federationId": "...",
  "seasonId": "2026"
}
```

`GET /staff-members/{id}/photo` is implemented alongside the existing player official photo read endpoint.

## Data model notes

ARCH-1 remains unchanged. The existing ARCH-1 schema already models `photo_subjects.subject_kind` as `athlete`, `staff_member`, or `referee`.

The SQL materialization was adjusted so ARCH-1 registration-scoped photo tables are not foreign-keyed only to `player_registrations`. The logical `registration_id` remains the seasonal registration identifier used by `photo_approvals`, `season_registration_photos`, snapshots, and audit.

## Tests

Executed:

- `pnpm --dir refcheckid-backend typecheck`
- `pnpm --dir refcheckid-backend test:unit`
- `pnpm --dir refcheckid-web typecheck`
- `pnpm --dir refcheckid-web test:unit`

Coverage added/updated for:

- staff member upload intent using `subjectKind=staff_member`;
- staff upload completion through the same object storage and validation pipeline;
- staff approval through the same federation approval lifecycle;
- season registration photo creation for staff registrations;
- Manager Web source checks for subject-based upload and staff backend state.

## Decisions

- No Staff-specific service, approval queue, upload service, or manifest was introduced.
- Existing photo feature flags were reused; no new feature flags were added.
- Player upload payloads remain compatible while the implementation is now subject-based.

## Next step

Do not proceed to the next milestone without explicit approval.
