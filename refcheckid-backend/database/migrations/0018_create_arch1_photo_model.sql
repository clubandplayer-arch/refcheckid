CREATE TABLE photo_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_kind text NOT NULL,
    canonical_person_id uuid,
    dedupe_key_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_photo_subjects_kind CHECK (subject_kind IN ('athlete','staff_member','referee')),
    CONSTRAINT chk_photo_subjects_timestamps CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX uq_photo_subjects_dedupe_active ON photo_subjects (dedupe_key_hash) WHERE deleted_at IS NULL AND dedupe_key_hash IS NOT NULL;
CREATE INDEX idx_photo_subjects_kind ON photo_subjects (subject_kind) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_photo_subjects_set_updated_at BEFORE UPDATE ON photo_subjects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE global_official_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_subject_id uuid NOT NULL,
    current_version_id uuid,
    status text NOT NULL DEFAULT 'missing',
    last_approved_at timestamptz,
    last_changed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_global_official_photos_subject FOREIGN KEY (photo_subject_id) REFERENCES photo_subjects (id),
    CONSTRAINT chk_global_official_photos_status CHECK (status IN ('missing','pending_first_approval','active','suspended','retired')),
    CONSTRAINT chk_global_official_photos_timestamps CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX uq_global_official_photos_subject_active ON global_official_photos (photo_subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_global_official_photos_status ON global_official_photos (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_global_official_photos_set_updated_at BEFORE UPDATE ON global_official_photos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE photo_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    global_official_photo_id uuid NOT NULL,
    version_number integer NOT NULL,
    uploaded_by_user_id uuid NOT NULL,
    uploaded_by_role text NOT NULL,
    uploaded_by_club_id uuid,
    origin_federation_id uuid,
    origin_season_id text,
    storage_original_key text NOT NULL,
    storage_normalized_key text,
    mime_type text NOT NULL,
    normalized_mime_type text,
    file_size_bytes bigint NOT NULL,
    width integer,
    height integer,
    sha256 text NOT NULL,
    perceptual_hash text,
    exif_stripped boolean NOT NULL DEFAULT false,
    av_scan_status text NOT NULL DEFAULT 'pending',
    validation_status text NOT NULL DEFAULT 'pending',
    status text NOT NULL DEFAULT 'uploaded',
    activated_at timestamptz,
    superseded_at timestamptz,
    archived_at timestamptz,
    rejection_reason_code text,
    rejection_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_photo_versions_global_photo FOREIGN KEY (global_official_photo_id) REFERENCES global_official_photos (id),
    CONSTRAINT fk_photo_versions_uploaded_by_club FOREIGN KEY (uploaded_by_club_id) REFERENCES clubs (id),
    CONSTRAINT fk_photo_versions_origin_federation FOREIGN KEY (origin_federation_id) REFERENCES federations (id),
    CONSTRAINT chk_photo_versions_file_size CHECK (file_size_bytes > 0),
    CONSTRAINT chk_photo_versions_dimensions CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)),
    CONSTRAINT chk_photo_versions_av_scan_status CHECK (av_scan_status IN ('pending','clean','infected','failed','skipped')),
    CONSTRAINT chk_photo_versions_validation_status CHECK (validation_status IN ('pending','valid','invalid')),
    CONSTRAINT chk_photo_versions_status CHECK (status IN ('uploaded','validating','pending_approval','active','rejected','superseded','archived','quarantined','erasure_pending','erased')),
    CONSTRAINT chk_photo_versions_timestamps CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX uq_photo_versions_number_active ON photo_versions (global_official_photo_id, version_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_photo_versions_storage_original_key_active ON photo_versions (storage_original_key) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_photo_versions_one_active_per_global_photo ON photo_versions (global_official_photo_id) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX idx_photo_versions_global_status ON photo_versions (global_official_photo_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_photo_versions_origin_federation ON photo_versions (origin_federation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_photo_versions_sha256 ON photo_versions (sha256) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_photo_versions_set_updated_at BEFORE UPDATE ON photo_versions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE global_official_photos
    ADD CONSTRAINT fk_global_official_photos_current_version FOREIGN KEY (current_version_id) REFERENCES photo_versions (id);

CREATE TABLE photo_approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_version_id uuid NOT NULL,
    federation_id uuid NOT NULL,
    discipline_id uuid,
    season_id text NOT NULL,
    registration_id uuid,
    requested_by_user_id uuid NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    decided_by_user_id uuid,
    decided_at timestamptz,
    status text NOT NULL DEFAULT 'pending',
    decision_reason_code text,
    decision_notes text,
    scope text NOT NULL,
    sla_due_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_photo_approvals_version FOREIGN KEY (photo_version_id) REFERENCES photo_versions (id),
    CONSTRAINT fk_photo_approvals_federation FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT chk_photo_approvals_status CHECK (status IN ('pending','approved','rejected','cancelled','expired')),
    CONSTRAINT chk_photo_approvals_scope CHECK (scope IN ('single_registration','federation_season','global_reuse')),
    CONSTRAINT chk_photo_approvals_decision CHECK ((status = 'pending' AND decided_at IS NULL) OR (status <> 'pending')),
    CONSTRAINT chk_photo_approvals_timestamps CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX uq_photo_approvals_one_pending_registration ON photo_approvals (registration_id, season_id) WHERE deleted_at IS NULL AND status = 'pending' AND registration_id IS NOT NULL;
CREATE INDEX idx_photo_approvals_federation_status ON photo_approvals (federation_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_photo_approvals_version ON photo_approvals (photo_version_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_photo_approvals_season_status ON photo_approvals (season_id, status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_photo_approvals_set_updated_at BEFORE UPDATE ON photo_approvals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE season_registration_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id uuid NOT NULL,
    discipline_id uuid,
    season_id text NOT NULL,
    registration_id uuid NOT NULL,
    photo_subject_id uuid NOT NULL,
    global_official_photo_id uuid NOT NULL,
    effective_version_id uuid NOT NULL,
    approval_id uuid,
    status text NOT NULL DEFAULT 'pending',
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_season_registration_photos_federation FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT fk_season_registration_photos_subject FOREIGN KEY (photo_subject_id) REFERENCES photo_subjects (id),
    CONSTRAINT fk_season_registration_photos_global_photo FOREIGN KEY (global_official_photo_id) REFERENCES global_official_photos (id),
    CONSTRAINT fk_season_registration_photos_version FOREIGN KEY (effective_version_id) REFERENCES photo_versions (id),
    CONSTRAINT fk_season_registration_photos_approval FOREIGN KEY (approval_id) REFERENCES photo_approvals (id),
    CONSTRAINT chk_season_registration_photos_status CHECK (status IN ('pending','valid','suspended','expired','revoked')),
    CONSTRAINT chk_season_registration_photos_validity CHECK (valid_until IS NULL OR valid_until >= valid_from),
    CONSTRAINT chk_season_registration_photos_timestamps CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX uq_season_registration_photos_registration_season_active ON season_registration_photos (registration_id, season_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_season_registration_photos_federation ON season_registration_photos (federation_id, season_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_season_registration_photos_subject ON season_registration_photos (photo_subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_season_registration_photos_version ON season_registration_photos (effective_version_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_season_registration_photos_set_updated_at BEFORE UPDATE ON season_registration_photos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE match_sheet_photo_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_sheet_id uuid NOT NULL,
    match_id uuid NOT NULL,
    registration_id uuid NOT NULL,
    season_registration_photo_id uuid NOT NULL,
    photo_subject_id uuid NOT NULL,
    global_official_photo_id uuid NOT NULL,
    photo_version_id uuid NOT NULL,
    photo_etag text NOT NULL,
    rendition_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
    frozen_at timestamptz NOT NULL DEFAULT now(),
    frozen_by_user_id uuid NOT NULL,
    freeze_reason text NOT NULL,
    audit_correlation_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_match_sheet_photo_snapshots_match_sheet FOREIGN KEY (match_sheet_id) REFERENCES match_sheets (id),
    CONSTRAINT fk_match_sheet_photo_snapshots_match FOREIGN KEY (match_id) REFERENCES matches (id),
    CONSTRAINT fk_match_sheet_photo_snapshots_season_photo FOREIGN KEY (season_registration_photo_id) REFERENCES season_registration_photos (id),
    CONSTRAINT fk_match_sheet_photo_snapshots_subject FOREIGN KEY (photo_subject_id) REFERENCES photo_subjects (id),
    CONSTRAINT fk_match_sheet_photo_snapshots_global_photo FOREIGN KEY (global_official_photo_id) REFERENCES global_official_photos (id),
    CONSTRAINT fk_match_sheet_photo_snapshots_version FOREIGN KEY (photo_version_id) REFERENCES photo_versions (id),
    CONSTRAINT chk_match_sheet_photo_snapshots_timestamps CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX uq_match_sheet_photo_snapshots_sheet_registration ON match_sheet_photo_snapshots (match_sheet_id, registration_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_sheet_photo_snapshots_match_sheet ON match_sheet_photo_snapshots (match_sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_sheet_photo_snapshots_version ON match_sheet_photo_snapshots (photo_version_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_match_sheet_photo_snapshots_set_updated_at BEFORE UPDATE ON match_sheet_photo_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE photo_access_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_version_id uuid NOT NULL,
    grantee_type text NOT NULL,
    grantee_id uuid NOT NULL,
    scope text NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_photo_access_grants_version FOREIGN KEY (photo_version_id) REFERENCES photo_versions (id),
    CONSTRAINT chk_photo_access_grants_type CHECK (grantee_type IN ('user','role','club','federation','match_assignment')),
    CONSTRAINT chk_photo_access_grants_revocation CHECK (revoked_at IS NULL OR revoked_at <= expires_at),
    CONSTRAINT chk_photo_access_grants_timestamps CHECK (updated_at >= created_at)
);
CREATE INDEX idx_photo_access_grants_version ON photo_access_grants (photo_version_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_photo_access_grants_grantee ON photo_access_grants (grantee_type, grantee_id, expires_at) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_photo_access_grants_set_updated_at BEFORE UPDATE ON photo_access_grants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE photo_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id uuid NOT NULL,
    actor_user_id uuid,
    actor_role text NOT NULL,
    federation_id uuid,
    season_id text,
    registration_id uuid,
    photo_subject_id uuid,
    photo_version_id uuid,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip_hash text,
    user_agent_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_photo_audit_events_federation FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT fk_photo_audit_events_subject FOREIGN KEY (photo_subject_id) REFERENCES photo_subjects (id),
    CONSTRAINT fk_photo_audit_events_version FOREIGN KEY (photo_version_id) REFERENCES photo_versions (id),
    CONSTRAINT chk_photo_audit_events_timestamps CHECK (updated_at >= created_at)
);
CREATE INDEX idx_photo_audit_events_correlation ON photo_audit_events (correlation_id);
CREATE INDEX idx_photo_audit_events_version ON photo_audit_events (photo_version_id, created_at);
CREATE INDEX idx_photo_audit_events_registration ON photo_audit_events (registration_id, created_at);
CREATE INDEX idx_photo_audit_events_federation ON photo_audit_events (federation_id, created_at);
CREATE TRIGGER trg_photo_audit_events_set_updated_at BEFORE UPDATE ON photo_audit_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE photo_sync_cursors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope text NOT NULL,
    cursor text NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    invalidated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_photo_sync_cursors_timestamps CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX uq_photo_sync_cursors_scope_active ON photo_sync_cursors (scope, cursor) WHERE deleted_at IS NULL;
CREATE INDEX idx_photo_sync_cursors_scope_generated ON photo_sync_cursors (scope, generated_at) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_photo_sync_cursors_set_updated_at BEFORE UPDATE ON photo_sync_cursors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE photo_subjects IS 'ARCH-1 global photo subjects shared across federations and disciplines.';
COMMENT ON TABLE global_official_photos IS 'ARCH-1 global official photo pointer for a photo subject.';
COMMENT ON TABLE season_registration_photos IS 'ARCH-1 seasonal registration binding to an effective global photo version.';
COMMENT ON TABLE photo_versions IS 'ARCH-1 immutable photo versions with ACTIVE to SUPERSEDED to ARCHIVED retention states.';
COMMENT ON TABLE photo_approvals IS 'ARCH-1 federation approval workflow for photo versions.';
COMMENT ON TABLE match_sheet_photo_snapshots IS 'ARCH-1 frozen match sheet photo references captured at match sheet closure.';
COMMENT ON TABLE photo_access_grants IS 'ARCH-1 contextual read grants for privacy-safe signed URL generation.';
COMMENT ON TABLE photo_audit_events IS 'ARCH-1 photo-specific audit trail.';
COMMENT ON TABLE photo_sync_cursors IS 'ARCH-1 schema-level support for offline manifest cursors.';
