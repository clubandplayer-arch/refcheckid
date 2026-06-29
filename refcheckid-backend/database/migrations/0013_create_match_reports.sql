CREATE TABLE match_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL,
    referee_id uuid NOT NULL,
    submitted_at timestamptz,
    status text NOT NULL DEFAULT 'draft',
    summary text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_match_reports_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_match_reports_match_id FOREIGN KEY (match_id) REFERENCES matches (id),
    CONSTRAINT fk_match_reports_referee_id FOREIGN KEY (referee_id) REFERENCES referees (id),
    CONSTRAINT chk_match_reports_status CHECK (status IN ('draft','submitted','locked'))
);
COMMENT ON TABLE match_reports IS 'Referee report for a match.';
COMMENT ON COLUMN match_reports.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN match_reports.match_id IS 'Match id.';
COMMENT ON COLUMN match_reports.referee_id IS 'Referee id.';
COMMENT ON COLUMN match_reports.submitted_at IS 'Submitted at.';
COMMENT ON COLUMN match_reports.status IS 'Status.';
COMMENT ON COLUMN match_reports.summary IS 'Summary.';
COMMENT ON COLUMN match_reports.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN match_reports.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN match_reports.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_match_reports_match_id_active ON match_reports (match_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_reports_referee_status_submitted_at ON match_reports (referee_id, status, submitted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_reports_match_id ON match_reports (match_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_match_reports_set_updated_at BEFORE UPDATE ON match_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
