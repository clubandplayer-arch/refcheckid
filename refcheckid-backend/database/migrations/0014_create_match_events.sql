CREATE TABLE match_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL,
    match_report_id uuid,
    event_type text NOT NULL,
    occurred_at timestamptz NOT NULL,
    minute integer,
    subject_type text,
    subject_id uuid,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_match_events_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_match_events_match_id FOREIGN KEY (match_id) REFERENCES matches (id),
    CONSTRAINT fk_match_events_match_report_id FOREIGN KEY (match_report_id) REFERENCES match_reports (id),
    CONSTRAINT uq_match_events_match_time_type_subject UNIQUE (match_id, occurred_at, event_type, subject_type, subject_id),
    CONSTRAINT chk_match_events_minute CHECK (minute IS NULL OR minute >= 0),
    CONSTRAINT chk_match_events_subject_type CHECK (subject_type IS NULL OR subject_type IN ('player', 'staff', 'club', 'referee'))
);

COMMENT ON TABLE match_events IS 'Events recorded during or about a match.';
COMMENT ON COLUMN match_events.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN match_events.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN match_events.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN match_events.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
COMMENT ON COLUMN match_events.match_id IS 'Match id.';
COMMENT ON COLUMN match_events.match_report_id IS 'Match report id.';
COMMENT ON COLUMN match_events.event_type IS 'Event type.';
COMMENT ON COLUMN match_events.occurred_at IS 'Occurred at.';
COMMENT ON COLUMN match_events.minute IS 'Minute.';
COMMENT ON COLUMN match_events.subject_type IS 'Subject type.';
COMMENT ON COLUMN match_events.subject_id IS 'Subject id.';
COMMENT ON COLUMN match_events.description IS 'Description.';
CREATE INDEX idx_match_events_match_id ON match_events (match_id);
CREATE INDEX idx_match_events_match_report_id ON match_events (match_report_id);
CREATE INDEX idx_match_events_event_type ON match_events (event_type);
CREATE INDEX idx_match_events_occurred_at ON match_events (occurred_at);
