CREATE TABLE staff_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_member_id uuid NOT NULL,
    club_id uuid NOT NULL,
    season text NOT NULL,
    role text NOT NULL,
    registration_number text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_staff_registrations_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_staff_registrations_staff_member_id FOREIGN KEY (staff_member_id) REFERENCES staff_members (id),
    CONSTRAINT fk_staff_registrations_club_id FOREIGN KEY (club_id) REFERENCES clubs (id),
    CONSTRAINT chk_staff_registrations_status CHECK (status IN ('active','suspended','ended'))
);
COMMENT ON TABLE staff_registrations IS 'Staff registration with clubs by season and role.';
COMMENT ON COLUMN staff_registrations.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN staff_registrations.staff_member_id IS 'Staff member id.';
COMMENT ON COLUMN staff_registrations.club_id IS 'Club id.';
COMMENT ON COLUMN staff_registrations.season IS 'Season.';
COMMENT ON COLUMN staff_registrations.role IS 'Role.';
COMMENT ON COLUMN staff_registrations.registration_number IS 'Registration number.';
COMMENT ON COLUMN staff_registrations.status IS 'Status.';
COMMENT ON COLUMN staff_registrations.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN staff_registrations.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN staff_registrations.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_staff_registrations_season_number_active ON staff_registrations (season, registration_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_staff_registrations_member_club_season_role_active ON staff_registrations (staff_member_id, club_id, season, role) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_registrations_staff_member_id ON staff_registrations (staff_member_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_registrations_club_id ON staff_registrations (club_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_registrations_status ON staff_registrations (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_staff_registrations_set_updated_at BEFORE UPDATE ON staff_registrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
