CREATE TABLE photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid,
    staff_member_id uuid,
    referee_id uuid,
    match_id uuid,
    match_report_id uuid,
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    file_size_bytes bigint NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_photos_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_photos_player_id FOREIGN KEY (player_id) REFERENCES players (id),
    CONSTRAINT fk_photos_staff_member_id FOREIGN KEY (staff_member_id) REFERENCES staff_members (id),
    CONSTRAINT fk_photos_referee_id FOREIGN KEY (referee_id) REFERENCES referees (id),
    CONSTRAINT fk_photos_match_id FOREIGN KEY (match_id) REFERENCES matches (id),
    CONSTRAINT fk_photos_match_report_id FOREIGN KEY (match_report_id) REFERENCES match_reports (id),
    CONSTRAINT uq_photos_storage_path UNIQUE (storage_path),
    CONSTRAINT chk_photos_single_owner CHECK (num_nonnulls(player_id, staff_member_id, referee_id, match_id, match_report_id) = 1),
    CONSTRAINT chk_photos_file_size CHECK (file_size_bytes > 0),
    CONSTRAINT chk_photos_status CHECK (status IN ('active', 'archived'))
);

COMMENT ON TABLE photos IS 'Photo metadata for Supabase storage objects.';
COMMENT ON COLUMN photos.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN photos.player_id IS 'Referenced player owner when the photo belongs to a player.';
COMMENT ON COLUMN photos.staff_member_id IS 'Referenced staff member owner when the photo belongs to staff.';
COMMENT ON COLUMN photos.referee_id IS 'Referenced referee owner when the photo belongs to a referee.';
COMMENT ON COLUMN photos.match_id IS 'Referenced match owner when the photo belongs to a match.';
COMMENT ON COLUMN photos.match_report_id IS 'Referenced match report owner when the photo belongs to a report.';
COMMENT ON COLUMN photos.storage_path IS 'Supabase storage object path.';
COMMENT ON COLUMN photos.mime_type IS 'File MIME type.';
COMMENT ON COLUMN photos.file_size_bytes IS 'File size in bytes.';
COMMENT ON COLUMN photos.status IS 'Photo lifecycle status.';
COMMENT ON COLUMN photos.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN photos.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN photos.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE INDEX idx_photos_player_id ON photos (player_id);
CREATE INDEX idx_photos_staff_member_id ON photos (staff_member_id);
CREATE INDEX idx_photos_referee_id ON photos (referee_id);
CREATE INDEX idx_photos_match_id ON photos (match_id);
CREATE INDEX idx_photos_match_report_id ON photos (match_report_id);
CREATE INDEX idx_photos_status ON photos (status);
CREATE INDEX idx_photos_deleted_at ON photos (deleted_at);
