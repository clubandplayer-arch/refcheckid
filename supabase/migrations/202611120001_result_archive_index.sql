-- Additive: no changes to reports, results, photos or publication defaults.
CREATE INDEX IF NOT EXISTS result_archive_fixture_revision
  ON refcheckid.entities ((document->>'fixtureId'), ((document->>'revision')::integer) DESC)
  WHERE repository='platform_updates';
