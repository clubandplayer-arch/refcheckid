CREATE TABLE recognitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL,
    referee_id uuid NOT NULL,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    recognized_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'recognized',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_recognitions_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_recognitions_match_id FOREIGN KEY (match_id) REFERENCES matches (id),
    CONSTRAINT fk_recognitions_referee_id FOREIGN KEY (referee_id) REFERENCES referees (id),
    CONSTRAINT uq_recognitions_match_subject UNIQUE (match_id, subject_type, subject_id),
    CONSTRAINT chk_recognitions_subject_type CHECK (subject_type IN ('player', 'staff')),
    CONSTRAINT chk_recognitions_status CHECK (status IN ('recognized', 'rejected'))
);

COMMENT ON TABLE recognitions IS 'Recognition outcomes for match participants.';
COMMENT ON COLUMN recognitions.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN recognitions.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN recognitions.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN recognitions.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
COMMENT ON COLUMN recognitions.match_id IS 'Match id.';
COMMENT ON COLUMN recognitions.referee_id IS 'Referee id.';
COMMENT ON COLUMN recognitions.subject_type IS 'Subject type.';
COMMENT ON COLUMN recognitions.subject_id IS 'Subject id.';
COMMENT ON COLUMN recognitions.recognized_at IS 'Recognized at.';
COMMENT ON COLUMN recognitions.status IS 'Status.';
COMMENT ON COLUMN recognitions.notes IS 'Notes.';
CREATE INDEX idx_recognitions_match_id ON recognitions (match_id);
CREATE INDEX idx_recognitions_referee_id ON recognitions (referee_id);
CREATE INDEX idx_recognitions_subject ON recognitions (subject_type, subject_id);
CREATE INDEX idx_recognitions_status ON recognitions (status);
