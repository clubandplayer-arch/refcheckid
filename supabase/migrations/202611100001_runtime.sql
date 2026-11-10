-- New schema: does not alter the historical Drizzle/legacy Supabase schemas.
CREATE SCHEMA IF NOT EXISTS refcheckid;
REVOKE ALL ON SCHEMA refcheckid FROM PUBLIC, anon, authenticated;

-- Preserve existing UUIDs and documents during the first migration. Typed,
-- normalized tables can follow without changing the application's domain IDs.
CREATE TABLE refcheckid.entities (
  repository text NOT NULL CHECK (repository ~ '^[a-z_]+$'),
  id text NOT NULL,
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND document->>'id' = id),
  ordinal bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (repository, id)
);
CREATE INDEX entities_repository_ordinal ON refcheckid.entities(repository, ordinal);
ALTER TABLE refcheckid.entities ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: all access goes through authorized backend APIs.
REVOKE ALL ON ALL TABLES IN SCHEMA refcheckid FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA refcheckid FROM PUBLIC, anon, authenticated;

-- Private bucket, new name to avoid inheriting old broad "photos" policies.
INSERT INTO storage.buckets(id, name, public, file_size_limit)
VALUES ('refcheckid-photos', 'refcheckid-photos', false, 5242880)
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=5242880;
-- No authenticated storage.objects policy for this bucket. Signed uploads are
-- issued only after the backend checks club/registration scope. Downloads use
-- short-lived authorized URLs; the service secret remains server-side.
