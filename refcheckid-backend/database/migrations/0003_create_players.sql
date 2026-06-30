CREATE TABLE players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    birth_date date NOT NULL,
    birth_place text,
    fiscal_code text,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_players_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_players_federation_id FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT chk_players_status CHECK (status IN ('active','inactive')),
    CONSTRAINT chk_players_birth_date CHECK (birth_date >= DATE '1900-01-01')
);
COMMENT ON TABLE players IS 'Player identity registry.';
COMMENT ON COLUMN players.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN players.federation_id IS 'Federation id.';
COMMENT ON COLUMN players.first_name IS 'First name.';
COMMENT ON COLUMN players.last_name IS 'Last name.';
COMMENT ON COLUMN players.birth_date IS 'Birth date.';
COMMENT ON COLUMN players.birth_place IS 'Birth place.';
COMMENT ON COLUMN players.fiscal_code IS 'Fiscal code.';
COMMENT ON COLUMN players.status IS 'Status.';
COMMENT ON COLUMN players.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN players.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN players.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_players_federation_fiscal_code_active ON players (federation_id, fiscal_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_players_federation_id ON players (federation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_players_name ON players (last_name, first_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_players_status ON players (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_players_set_updated_at BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION set_updated_at();
