CREATE TABLE staff_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    birth_date date,
    fiscal_code text,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_staff_members_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_staff_members_federation_id FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT chk_staff_members_status CHECK (status IN ('active','inactive')),
    CONSTRAINT chk_staff_members_birth_date CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01')
);
COMMENT ON TABLE staff_members IS 'Staff member identity registry.';
COMMENT ON COLUMN staff_members.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN staff_members.federation_id IS 'Federation id.';
COMMENT ON COLUMN staff_members.first_name IS 'First name.';
COMMENT ON COLUMN staff_members.last_name IS 'Last name.';
COMMENT ON COLUMN staff_members.birth_date IS 'Birth date.';
COMMENT ON COLUMN staff_members.fiscal_code IS 'Fiscal code.';
COMMENT ON COLUMN staff_members.status IS 'Status.';
COMMENT ON COLUMN staff_members.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN staff_members.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN staff_members.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_staff_members_federation_fiscal_code_active ON staff_members (federation_id, fiscal_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_members_federation_id ON staff_members (federation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_members_name ON staff_members (last_name, first_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_members_status ON staff_members (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_staff_members_set_updated_at BEFORE UPDATE ON staff_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
