CREATE TABLE referees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    fiscal_code text,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_referees_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_referees_federation_id FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT chk_referees_status CHECK (status IN ('active','inactive'))
);
COMMENT ON TABLE referees IS 'Referee identity registry.';
COMMENT ON COLUMN referees.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN referees.federation_id IS 'Federation id.';
COMMENT ON COLUMN referees.first_name IS 'First name.';
COMMENT ON COLUMN referees.last_name IS 'Last name.';
COMMENT ON COLUMN referees.fiscal_code IS 'Fiscal code.';
COMMENT ON COLUMN referees.status IS 'Status.';
COMMENT ON COLUMN referees.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN referees.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN referees.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_referees_federation_fiscal_code_active ON referees (federation_id, fiscal_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_referees_federation_id ON referees (federation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_referees_name ON referees (last_name, first_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_referees_status ON referees (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_referees_set_updated_at BEFORE UPDATE ON referees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
