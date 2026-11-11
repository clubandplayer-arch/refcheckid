-- Additive indexes only: no record, approval or photo changes.
CREATE INDEX IF NOT EXISTS photo_approvals_queue_scope
  ON refcheckid.entities ((document->>'federationId'), (document->>'status'), (document->>'requestedAt'), id)
  WHERE repository='photo_approvals' AND document->>'deletedAt' IS NULL;
CREATE INDEX IF NOT EXISTS photo_entities_document_lookup
  ON refcheckid.entities USING gin (document jsonb_path_ops)
  WHERE repository IN ('photo_versions','photo_approvals','season_registration_photos','photo_subjects','global_official_photos');
