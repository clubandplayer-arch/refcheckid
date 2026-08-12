# Runtime state restart checklist

## Scope and operating limits

`REFCHECKID_RUNTIME_STATE_ROOT` is a local, single-process JSON adapter for development and
demonstration environments. It uses atomic file replacement to avoid partial files, but it does
not provide database transactions, locking between processes, or safe multi-instance writes.
Production deployments must use the SQL persistence architecture before horizontal scaling.

Photo metadata and photo objects remain separate and continue to use
`REFCHECKID_PHOTO_METADATA_ROOT` and `REFCHECKID_PHOTO_STORAGE_ROOT`.

Audit records and federation import staging are persisted because they are user-visible work and
must not disappear on an ordinary process restart. In-process domain-event delivery remains
transient by design.

## Automated restart gate

- [x] Federations and both clubs survive.
- [x] Players, player registrations, staff members, staff registrations, and referee survive.
- [x] Both match sheets, player ordering/roles, and staff assignments survive.
- [x] Frozen photo snapshots have exact registration coverage after restart.
- [x] Recognition records and the completed workflow survive.
- [x] Submitted report and completed match state survive.
- [x] Photo metadata and photo object bytes survive on their independent roots.
- [x] Workflow operations use application services where a service command exists.
- [x] Audit and federation-import staging repositories use the runtime adapter.

## Manual pre-merge gate

- [ ] Run the full quality gate documented in `.github/workflows/ci.yml`.
- [ ] Start the backend with three dedicated temporary roots.
- [ ] Complete both lineups, recognition, and report through REST/UI.
- [ ] Stop and restart the backend without running `demo:init`.
- [ ] Verify Manager, Referee, and Federation views.
- [ ] Run `demo:init` once and confirm it does not replace photos or regress locked/submitted states.
- [ ] Confirm no photo, backup, or runtime JSON file is tracked by Git.
