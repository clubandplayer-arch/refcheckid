CREATE TABLE match_sheets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL,
    club_id uuid NOT NULL,
    submitted_at timestamptz,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_match_sheets_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_match_sheets_match_id FOREIGN KEY (match_id) REFERENCES matches (id),
    CONSTRAINT fk_match_sheets_club_id FOREIGN KEY (club_id) REFERENCES clubs (id),
    CONSTRAINT uq_match_sheets_match_club UNIQUE (match_id, club_id),
    CONSTRAINT chk_match_sheets_status CHECK (status IN ('draft', 'submitted', 'locked'))
);

COMMENT ON TABLE match_sheets IS 'Match sheet submitted by club for a match.';
COMMENT ON COLUMN match_sheets.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN match_sheets.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN match_sheets.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN match_sheets.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
COMMENT ON COLUMN match_sheets.match_id IS 'Match id.';
COMMENT ON COLUMN match_sheets.club_id IS 'Club id.';
COMMENT ON COLUMN match_sheets.submitted_at IS 'Submitted at.';
COMMENT ON COLUMN match_sheets.status IS 'Status.';
CREATE INDEX idx_match_sheets_match_id ON match_sheets (match_id);
CREATE INDEX idx_match_sheets_club_id ON match_sheets (club_id);
CREATE INDEX idx_match_sheets_status ON match_sheets (status);
