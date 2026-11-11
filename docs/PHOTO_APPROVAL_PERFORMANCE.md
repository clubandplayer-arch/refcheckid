# Photo approval performance

The federation photo queue previously enriched every approval before filtering,
loaded full-size originals as previews, and fetched the list again after each
decision. Photo reads also held the same PostgreSQL advisory lock as commands.

## Changes

- `/api/v1/photo-approvals/page` filters by authenticated federation, status,
  club and SLA in PostgreSQL, then enriches at most 13 rows to return a page of
  12 and a cursor. The cursor uses `(requestedAt, id)`, so approving entries
  does not shift later pages as offset pagination would.
- `/api/v1/photo-approvals/summary` counts pending requests without creating
  image URLs or joining every person's details.
- Decisions use targeted repository lookups rather than loading complete
  photo/version collections. Existing transactional checks and write locking
  remain in place.
- Queue, summary and signed photo reads use read-only transactions without
  the command advisory lock. Image retrieval no longer holds that lock while
  waiting for Storage.
- Private, immutable WebP previews fit within 320 × 320 pixels, preserve the
  whole image, and load lazily. The original remains available through a
  separately signed full-image link. Existing originals are unchanged.
  Previews are generated on first access and reused thereafter; the first
  access still includes original retrieval and image conversion.
- After the server confirms a decision, the card and counts update locally.
  The queue is not downloaded again. Failed decisions remain retryable.

## Deployment

1. Apply `supabase/migrations/202611110002_photo_queue_indexes.sql` in the
   staging project's Supabase SQL Editor. These two additive indexes do not
   change records, approvals, or stored photos. Do not rerun the roster import.
2. Deploy this branch through the normal reviewed main-branch workflow.
   Both the frontend and backend must come from this change.
3. Log in as the federation on the stable staging URL. Check the pending total,
   club filters, next/previous pages, previews and full-image links.
4. Approve one intended photo. The button should immediately show progress;
   success appears only after the server response. In DevTools Network, this
   must not trigger another `/photo-approvals/page` request. Check that the club
   can see the approved photo and that the pending count decreases.
5. Compare cold and warm timings in Vercel logs. Warm previews should reuse
   derived files. A cold Vercel instance and first-time thumbnails can still
   take longer; local tests are not measurements of deployed response times.

## Verification and limits

Automated tests exercise 4,000 scoped approvals (plus a foreign federation),
cursor continuity after approval, club filtering, counts, and unauthorized
access. A real PhotoService decision against the PostgreSQL-compatible test
engine with 4,000 approvals and 8,000 versions reads nine rows in 20 queries.
Tests verify preview reuse and unchanged originals, immediate UI progress,
retryable failures, and no list refetch after success. The isolated Chromium
acceptance workflow also exercises a federation approval with real API and
image responses.

The queue still counts matching metadata to show an exact total. Actual writes
remain serialized to preserve application invariants. These tests cover a queue
of 4,000 photos, not 4,000 concurrent operators or a production throughput SLA.
SQLite retains a compatibility implementation; the bounded SQL path targets
the cloud PostgreSQL deployment.
