CREATE TABLE matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id uuid NOT NULL,
    home_club_id uuid NOT NULL,
    away_club_id uuid NOT NULL,
    referee_id uuid,
    season text NOT NULL,
    scheduled_at timestamptz NOT NULL,
    venue text,
    status text NOT NULL DEFAULT 'scheduled',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_matches_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_matches_federation_id FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT fk_matches_home_club_id FOREIGN KEY (home_club_id) REFERENCES clubs (id),
    CONSTRAINT fk_matches_away_club_id FOREIGN KEY (away_club_id) REFERENCES clubs (id),
    CONSTRAINT fk_matches_referee_id FOREIGN KEY (referee_id) REFERENCES referees (id),
    CONSTRAINT chk_matches_distinct_clubs CHECK (home_club_id <> away_club_id),
    CONSTRAINT chk_matches_status CHECK (status IN ('scheduled','in_progress','completed','cancelled'))
);
COMMENT ON TABLE matches IS 'Match registry.';
COMMENT ON COLUMN matches.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN matches.federation_id IS 'Federation id.';
COMMENT ON COLUMN matches.home_club_id IS 'Home club id.';
COMMENT ON COLUMN matches.away_club_id IS 'Away club id.';
COMMENT ON COLUMN matches.referee_id IS 'Referee id.';
COMMENT ON COLUMN matches.season IS 'Season.';
COMMENT ON COLUMN matches.scheduled_at IS 'Scheduled at.';
COMMENT ON COLUMN matches.venue IS 'Venue.';
COMMENT ON COLUMN matches.status IS 'Status.';
COMMENT ON COLUMN matches.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN matches.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN matches.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_matches_clubs_schedule_active ON matches (home_club_id, away_club_id, scheduled_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_matches_federation_status_scheduled_at ON matches (federation_id, status, scheduled_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_matches_home_club_id ON matches (home_club_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_matches_away_club_id ON matches (away_club_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_matches_referee_id ON matches (referee_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_matches_set_updated_at BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
