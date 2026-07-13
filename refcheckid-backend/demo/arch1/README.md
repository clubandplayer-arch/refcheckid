# ARCH-1 Demo Bootstrap Dataset

This directory contains the text-only contract for the official ARCH-1 demo bootstrap.

## Scope

The dataset is intentionally declarative. It must be consumed by bootstrap scripts through the official application workflows only:

1. authenticate with demo users;
2. call `POST /api/v1/federation-sync` with `federationSyncPayload`;
3. generate demo images at runtime from `photoPlan.generatedImage`;
4. call `POST /api/v1/photos/upload-intent`;
5. call `POST /api/v1/photos/uploads/:id/complete`;
6. call `POST /api/v1/photo-approvals/:id/approve`;
7. submit and lock match sheets;
8. start and complete recognition;
9. transition the match and submit the match report;
10. run final verification through public read APIs.

## Non-goals

- Do not insert SQL records manually.
- Do not write repository records directly from the bootstrap.
- Do not bypass Upload Intent, Upload Complete, Approval, or Federation Sync.
- Do not commit binary demo images. Demo images must be generated at runtime from text metadata.

## Known workflow dependency

The dataset references the pilot match sheet IDs already used by the local runtime. A later micro PR must stop if the official workflow cannot materialize match sheet rows and photo snapshots without direct data writes.
