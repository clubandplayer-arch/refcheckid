CREATE TABLE recognitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL,
    referee_id uuid NOT NULL,
    match_sheet_player_id uuid,
    match_sheet_staff_id uuid,
    recognized_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'recognized',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_recognitions_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_recognitions_match_id FOREIGN KEY (match_id) REFERENCES matches (id),
    CONSTRAINT fk_recognitions_referee_id FOREIGN KEY (referee_id) REFERENCES referees (id),
    CONSTRAINT fk_recognitions_match_sheet_player_id FOREIGN KEY (match_sheet_player_id) REFERENCES match_sheet_players (id),
    CONSTRAINT fk_recognitions_match_sheet_staff_id FOREIGN KEY (match_sheet_staff_id) REFERENCES match_sheet_staff (id),
    CONSTRAINT chk_recognitions_single_subject CHECK (num_nonnulls(match_sheet_player_id, match_sheet_staff_id) = 1),
    CONSTRAINT chk_recognitions_status CHECK (status IN ('recognized','rejected'))
);
COMMENT ON TABLE recognitions IS 'Recognition outcomes for match participants.';
COMMENT ON COLUMN recognitions.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN recognitions.match_id IS 'Match id.';
COMMENT ON COLUMN recognitions.referee_id IS 'Referee id.';
COMMENT ON COLUMN recognitions.match_sheet_player_id IS 'Match sheet player id.';
COMMENT ON COLUMN recognitions.match_sheet_staff_id IS 'Match sheet staff id.';
COMMENT ON COLUMN recognitions.recognized_at IS 'Recognized at.';
COMMENT ON COLUMN recognitions.status IS 'Status.';
COMMENT ON COLUMN recognitions.notes IS 'Notes.';
COMMENT ON COLUMN recognitions.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN recognitions.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN recognitions.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_recognitions_match_player_active ON recognitions (match_id, match_sheet_player_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_recognitions_match_staff_active ON recognitions (match_id, match_sheet_staff_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recognitions_match_status_recognized_at ON recognitions (match_id, status, recognized_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_recognitions_referee_id ON recognitions (referee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recognitions_match_sheet_player_id ON recognitions (match_sheet_player_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recognitions_match_sheet_staff_id ON recognitions (match_sheet_staff_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_recognitions_set_updated_at BEFORE UPDATE ON recognitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
