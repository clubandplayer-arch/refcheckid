CREATE TABLE federation_import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id uuid NOT NULL,
    import_type text NOT NULL,
    original_filename text NOT NULL,
    mime_type text NOT NULL,
    file_size_bytes integer NOT NULL DEFAULT 0,
    sha256 text NOT NULL,
    uploaded_by_user_id uuid NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'uploaded',
    source_system text,
    declared_type text,
    detected_type text,
    total_rows integer NOT NULL DEFAULT 0,
    valid_rows integer NOT NULL DEFAULT 0,
    warning_rows integer NOT NULL DEFAULT 0,
    error_rows integer NOT NULL DEFAULT 0,
    committed_rows integer NOT NULL DEFAULT 0,
    mapping_config jsonb,
    report jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_federation_import_batches_federation FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT chk_federation_import_batches_type CHECK (import_type IN ('clubs','players_general','players_by_club','staff','referees','calendar','designations')),
    CONSTRAINT chk_federation_import_batches_status CHECK (status IN ('uploaded','parsed','mapped','validated','ready_to_commit','committed','failed')),
    CONSTRAINT chk_federation_import_batches_sizes CHECK (file_size_bytes >= 0),
    CONSTRAINT chk_federation_import_batches_counts CHECK (total_rows >= 0 AND valid_rows >= 0 AND warning_rows >= 0 AND error_rows >= 0 AND committed_rows >= 0),
    CONSTRAINT chk_federation_import_batches_timestamps CHECK (updated_at >= created_at)
);

CREATE TABLE federation_import_rows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL,
    row_number integer NOT NULL,
    raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    normalized_data jsonb,
    status text NOT NULL DEFAULT 'pending',
    errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    target_entity_type text,
    target_entity_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_federation_import_rows_batch FOREIGN KEY (batch_id) REFERENCES federation_import_batches (id),
    CONSTRAINT chk_federation_import_rows_status CHECK (status IN ('pending','valid','warning','error','committed')),
    CONSTRAINT chk_federation_import_rows_number CHECK (row_number > 0),
    CONSTRAINT chk_federation_import_rows_timestamps CHECK (updated_at >= created_at)
);

CREATE INDEX idx_federation_import_batches_federation_status ON federation_import_batches (federation_id, status, uploaded_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_federation_import_batches_type ON federation_import_batches (import_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_federation_import_rows_batch_status ON federation_import_rows (batch_id, status, row_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_federation_import_rows_batch_row ON federation_import_rows (batch_id, row_number) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_federation_import_batches_set_updated_at BEFORE UPDATE ON federation_import_batches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_federation_import_rows_set_updated_at BEFORE UPDATE ON federation_import_rows FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE federation_import_batches IS 'Federation data import staging batches created before parsing, preview and final commit.';
COMMENT ON TABLE federation_import_rows IS 'Federation data import staging rows populated by later parser/validation PRs.';
