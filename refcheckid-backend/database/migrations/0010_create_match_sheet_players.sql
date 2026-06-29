CREATE TABLE match_sheet_players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_sheet_id uuid NOT NULL,
    player_registration_id uuid NOT NULL,
    shirt_number integer,
    role text NOT NULL DEFAULT 'player',
    status text NOT NULL DEFAULT 'listed',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_match_sheet_players_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_match_sheet_players_match_sheet_id FOREIGN KEY (match_sheet_id) REFERENCES match_sheets (id),
    CONSTRAINT fk_match_sheet_players_player_registration_id FOREIGN KEY (player_registration_id) REFERENCES player_registrations (id),
    CONSTRAINT chk_match_sheet_players_shirt_number CHECK (shirt_number IS NULL OR shirt_number > 0),
    CONSTRAINT chk_match_sheet_players_status CHECK (status IN ('listed','recognized','excluded'))
);
COMMENT ON TABLE match_sheet_players IS 'Players listed on a match sheet.';
COMMENT ON COLUMN match_sheet_players.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN match_sheet_players.match_sheet_id IS 'Match sheet id.';
COMMENT ON COLUMN match_sheet_players.player_registration_id IS 'Player registration id.';
COMMENT ON COLUMN match_sheet_players.shirt_number IS 'Shirt number.';
COMMENT ON COLUMN match_sheet_players.role IS 'Role.';
COMMENT ON COLUMN match_sheet_players.status IS 'Status.';
COMMENT ON COLUMN match_sheet_players.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN match_sheet_players.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN match_sheet_players.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_match_sheet_players_sheet_registration_active ON match_sheet_players (match_sheet_id, player_registration_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_match_sheet_players_sheet_shirt_active ON match_sheet_players (match_sheet_id, shirt_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_sheet_players_match_sheet_id ON match_sheet_players (match_sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_sheet_players_player_registration_id ON match_sheet_players (player_registration_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_sheet_players_status ON match_sheet_players (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_match_sheet_players_set_updated_at BEFORE UPDATE ON match_sheet_players FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_match_sheet_players_validate_club BEFORE INSERT OR UPDATE ON match_sheet_players FOR EACH ROW EXECUTE FUNCTION validate_match_sheet_player_club();
