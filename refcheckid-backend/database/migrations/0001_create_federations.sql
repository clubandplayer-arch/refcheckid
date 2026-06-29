CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION validate_match_sheet_club_participant()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM matches
        WHERE matches.id = NEW.match_id
          AND NEW.club_id IN (matches.home_club_id, matches.away_club_id)
    ) THEN
        RAISE EXCEPTION 'match sheet club must be one of the match clubs';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION validate_match_sheet_player_club()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM match_sheets
        JOIN player_registrations ON player_registrations.id = NEW.player_registration_id
        WHERE match_sheets.id = NEW.match_sheet_id
          AND match_sheets.club_id = player_registrations.club_id
    ) THEN
        RAISE EXCEPTION 'player registration must belong to the match sheet club';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION validate_match_sheet_staff_club()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM match_sheets
        JOIN staff_registrations ON staff_registrations.id = NEW.staff_registration_id
        WHERE match_sheets.id = NEW.match_sheet_id
          AND match_sheets.club_id = staff_registrations.club_id
    ) THEN
        RAISE EXCEPTION 'staff registration must belong to the match sheet club';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TABLE federations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    fiscal_code text,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_federations_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT chk_federations_status CHECK (status IN ('active','inactive'))
);
COMMENT ON TABLE federations IS 'Sports federation registry.';
COMMENT ON COLUMN federations.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN federations.name IS 'Name.';
COMMENT ON COLUMN federations.fiscal_code IS 'Fiscal code.';
COMMENT ON COLUMN federations.status IS 'Status.';
COMMENT ON COLUMN federations.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN federations.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN federations.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE UNIQUE INDEX uq_federations_name_active ON federations (name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_federations_fiscal_code_active ON federations (fiscal_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_federations_status ON federations (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_federations_deleted_at ON federations (deleted_at);
CREATE TRIGGER trg_federations_set_updated_at BEFORE UPDATE ON federations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
