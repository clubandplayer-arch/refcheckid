# ARCH-1 Demo Bootstrap Dataset

This directory contains the text-only contract for the official ARCH-1 demo bootstrap.

## Scope

The dataset is intentionally declarative. It must be consumed by bootstrap scripts through the official application workflows only:

1. authenticate with demo users;
2. call `POST /api/v1/federation-sync` with `federationSyncPayload`;
3. generate demo images at runtime from `photoPlan.generatedImage` using `scripts/demo-image-generator.ts`;
4. call `POST /api/v1/photos/upload-intent`;
5. call `POST /api/v1/photos/uploads/:id/complete`;
6. call `POST /api/v1/photo-approvals/:id/approve`;
7. submit and lock match sheets;
8. start and complete recognition;
9. transition the match and submit the match report;
10. run final verification through public read APIs.

## Federation Sync bootstrap

The first executable bootstrap slice is available as:

```bash
pnpm demo:bootstrap -- --dry-run
pnpm demo:bootstrap
```

The command validates this dataset, authenticates with the demo federation and manager accounts, calls `POST /api/v1/federation-sync`, verifies the synchronized federation, clubs, referees, players, registrations, staff, and match through public read APIs, then executes the official photo flow for every `photoPlan` item: Upload Intent, Upload Complete, pending approval lookup, federation Approval, and season-photo verification. The dry run validates the dataset and prints the expected Federation Sync counts and photo upload count without calling the backend.

## Runtime image generation

`scripts/demo-image-generator.ts` converts a JSON `generatedImage` spec to PNG bytes at runtime. The generated PNG is written only by the caller, for example to stdout or directly into an Upload Complete payload; no generated image file is versioned in the repository.

Example:

```bash
pnpm build && node dist/scripts/demo-image-generator.js '{"initials":"HU","shirtNumber":10,"primaryColor":"#1d4ed8","secondaryColor":"#ffffff"}' > /tmp/refcheckid-demo.png
```

## Non-goals

- Do not insert SQL records manually.
- Do not write repository records directly from the bootstrap.
- Do not bypass Upload Intent, Upload Complete, Approval, or Federation Sync.
- Do not commit binary demo images. Demo images must be generated at runtime from text metadata.

## Known workflow dependency

The dataset references the pilot match sheet IDs already used by the local runtime. A later micro PR must stop if the official workflow cannot materialize match sheet rows and photo snapshots without direct data writes.
