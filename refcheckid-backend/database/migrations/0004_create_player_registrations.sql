CREATE TABLE player_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL,
    club_id uuid NOT NULL,
    season text NOT NULL,
    registration_number text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    registered_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_player_registrations_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_player_registrations_player_id FOREIGN KEY (player_id) REFERENCES players (id),
    CONSTRAINT fk_player_registrations_club_id FOREIGN KEY (club_id) REFERENCES clubs (id),
    CONSTRAINT chk_player_registrations_status CHECK (status IN ('active','suspended','ended'))
);
COMMENT ON TABLE player_registrations IS 'Player registration with clubs by season.';
COMMENT ON COLUMN player_registrations.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN player_registrations.player_id IS 'Player id.';
COMMENT ON COLUMN player_registrations.club_id IS 'Club id.';
COMMENT ON COLUMN player_registrations.season IS 'Season.';
COMMENT ON COLUMN player_registrations.registration_number IS 'Registration number.';
COMMENT ON COLUMN player_registrations.status IS 'Status.';
COMMENT ON COLUMN player_registrations.registered_at IS 'Registered at.';
COMMENT ON COLUMN player_registrations.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN player_registrations.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN player_registrations.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_player_registrations_season_number_active ON player_registrations (season, registration_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_player_registrations_player_club_season_active ON player_registrations (player_id, club_id, season) WHERE deleted_at IS NULL;
CREATE INDEX idx_player_registrations_player_id ON player_registrations (player_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_player_registrations_club_id ON player_registrations (club_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_player_registrations_status ON player_registrations (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_player_registrations_set_updated_at BEFORE UPDATE ON player_registrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
