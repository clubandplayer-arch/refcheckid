CREATE TABLE clubs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id uuid NOT NULL,
    name text NOT NULL,
    fiscal_code text,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_clubs_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_clubs_federation_id FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT chk_clubs_status CHECK (status IN ('active','inactive'))
);
COMMENT ON TABLE clubs IS 'Club registry connected to federations.';
COMMENT ON COLUMN clubs.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN clubs.federation_id IS 'Federation id.';
COMMENT ON COLUMN clubs.name IS 'Name.';
COMMENT ON COLUMN clubs.fiscal_code IS 'Fiscal code.';
COMMENT ON COLUMN clubs.status IS 'Status.';
COMMENT ON COLUMN clubs.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN clubs.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN clubs.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_clubs_federation_name_active ON clubs (federation_id, name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_clubs_fiscal_code_active ON clubs (fiscal_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_clubs_federation_id ON clubs (federation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clubs_status ON clubs (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_clubs_deleted_at ON clubs (deleted_at);
CREATE TRIGGER trg_clubs_set_updated_at BEFORE UPDATE ON clubs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
