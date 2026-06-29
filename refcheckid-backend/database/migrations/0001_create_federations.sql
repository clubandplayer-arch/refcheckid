CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE federations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    fiscal_code text,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_federations_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT uq_federations_name UNIQUE (name),
    CONSTRAINT uq_federations_fiscal_code UNIQUE (fiscal_code),
    CONSTRAINT chk_federations_status CHECK (status IN ('active', 'inactive'))
);

COMMENT ON TABLE federations IS 'Sports federation registry.';
COMMENT ON COLUMN federations.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN federations.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN federations.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN federations.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
COMMENT ON COLUMN federations.name IS 'Name.';
COMMENT ON COLUMN federations.fiscal_code IS 'Fiscal code.';
COMMENT ON COLUMN federations.status IS 'Status.';
CREATE INDEX idx_federations_status ON federations (status);
CREATE INDEX idx_federations_deleted_at ON federations (deleted_at);
