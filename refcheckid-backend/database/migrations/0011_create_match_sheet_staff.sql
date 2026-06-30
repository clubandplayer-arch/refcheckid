CREATE TABLE match_sheet_staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_sheet_id uuid NOT NULL,
    staff_registration_id uuid NOT NULL,
    role text NOT NULL,
    status text NOT NULL DEFAULT 'listed',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_match_sheet_staff_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_match_sheet_staff_match_sheet_id FOREIGN KEY (match_sheet_id) REFERENCES match_sheets (id),
    CONSTRAINT fk_match_sheet_staff_staff_registration_id FOREIGN KEY (staff_registration_id) REFERENCES staff_registrations (id),
    CONSTRAINT chk_match_sheet_staff_status CHECK (status IN ('listed','recognized','excluded'))
);
COMMENT ON TABLE match_sheet_staff IS 'Staff listed on a match sheet.';
COMMENT ON COLUMN match_sheet_staff.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN match_sheet_staff.match_sheet_id IS 'Match sheet id.';
COMMENT ON COLUMN match_sheet_staff.staff_registration_id IS 'Staff registration id.';
COMMENT ON COLUMN match_sheet_staff.role IS 'Role.';
COMMENT ON COLUMN match_sheet_staff.status IS 'Status.';
COMMENT ON COLUMN match_sheet_staff.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN match_sheet_staff.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN match_sheet_staff.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_match_sheet_staff_sheet_registration_active ON match_sheet_staff (match_sheet_id, staff_registration_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_sheet_staff_match_sheet_id ON match_sheet_staff (match_sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_sheet_staff_staff_registration_id ON match_sheet_staff (staff_registration_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_match_sheet_staff_status ON match_sheet_staff (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_match_sheet_staff_set_updated_at BEFORE UPDATE ON match_sheet_staff FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_match_sheet_staff_validate_club BEFORE INSERT OR UPDATE ON match_sheet_staff FOR EACH ROW EXECUTE FUNCTION validate_match_sheet_staff_club();
