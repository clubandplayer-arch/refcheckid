CREATE TABLE match_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL,
    match_report_id uuid,
    event_type text NOT NULL,
    occurred_at timestamptz NOT NULL,
    minute integer,
    match_sheet_player_id uuid,
    match_sheet_staff_id uuid,
    club_id uuid,
    referee_id uuid,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_match_events_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_match_events_match_id FOREIGN KEY (match_id) REFERENCES matches (id),
    CONSTRAINT fk_match_events_match_report_id FOREIGN KEY (match_report_id) REFERENCES match_reports (id),
    CONSTRAINT fk_match_events_match_sheet_player_id FOREIGN KEY (match_sheet_player_id) REFERENCES match_sheet_players (id),
    CONSTRAINT fk_match_events_match_sheet_staff_id FOREIGN KEY (match_sheet_staff_id) REFERENCES match_sheet_staff (id),
    CONSTRAINT fk_match_events_club_id FOREIGN KEY (club_id) REFERENCES clubs (id),
    CONSTRAINT fk_match_events_referee_id FOREIGN KEY (referee_id) REFERENCES referees (id),
    CONSTRAINT chk_match_events_minute CHECK (minute IS NULL OR minute >= 0),
    CONSTRAINT chk_match_events_single_subject CHECK (num_nonnulls(match_sheet_player_id, match_sheet_staff_id, club_id, referee_id) <= 1)
);
COMMENT ON TABLE match_events IS 'Events recorded during or about a match.';
COMMENT ON COLUMN match_events.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN match_events.match_id IS 'Match id.';
COMMENT ON COLUMN match_events.match_report_id IS 'Match report id.';
COMMENT ON COLUMN match_events.event_type IS 'Event type.';
COMMENT ON COLUMN match_events.occurred_at IS 'Occurred at.';
COMMENT ON COLUMN match_events.minute IS 'Minute.';
COMMENT ON COLUMN match_events.match_sheet_player_id IS 'Match sheet player id.';
COMMENT ON COLUMN match_events.match_sheet_staff_id IS 'Match sheet staff id.';
COMMENT ON COLUMN match_events.club_id IS 'Club id.';
COMMENT ON COLUMN match_events.referee_id IS 'Referee id.';
COMMENT ON COLUMN match_events.description IS 'Description.';
COMMENT ON COLUMN match_events.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN match_events.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN match_events.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_match_events_match_time_type_subject_active ON match_events (match_id, occurred_at, event_type, match_sheet_player_id, match_sheet_staff_id, club_id, referee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_events_match_occurred_at ON match_events (match_id, occurred_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_events_match_report_id ON match_events (match_report_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_events_event_type ON match_events (event_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_events_match_sheet_player_id ON match_events (match_sheet_player_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_events_match_sheet_staff_id ON match_events (match_sheet_staff_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_match_events_set_updated_at BEFORE UPDATE ON match_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
