ALTER TABLE match_sheet_photo_snapshots
  ADD COLUMN photo_status text NOT NULL DEFAULT 'active',
  ALTER COLUMN season_registration_photo_id DROP NOT NULL,
  ALTER COLUMN photo_subject_id DROP NOT NULL,
  ALTER COLUMN global_official_photo_id DROP NOT NULL,
  ALTER COLUMN photo_version_id DROP NOT NULL,
  ALTER COLUMN photo_etag DROP NOT NULL,
  ADD CONSTRAINT chk_match_sheet_photo_snapshots_photo_status CHECK (photo_status IN ('active','missing','suspended','unavailable'));

COMMENT ON COLUMN match_sheet_photo_snapshots.photo_status IS 'Official photo status frozen for the listed match-sheet subject.';
