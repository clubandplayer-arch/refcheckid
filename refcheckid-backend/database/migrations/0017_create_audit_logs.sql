CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_federation_id uuid,
    actor_club_id uuid,
    actor_referee_id uuid,
    federation_id uuid,
    club_id uuid,
    player_id uuid,
    player_registration_id uuid,
    staff_member_id uuid,
    staff_registration_id uuid,
    referee_id uuid,
    match_id uuid,
    match_sheet_id uuid,
    match_sheet_player_id uuid,
    match_sheet_staff_id uuid,
    recognition_id uuid,
    match_report_id uuid,
    match_event_id uuid,
    photo_id uuid,
    identity_document_id uuid,
    action text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_audit_logs_actor_federation_id FOREIGN KEY (actor_federation_id) REFERENCES federations (id),
    CONSTRAINT fk_audit_logs_actor_club_id FOREIGN KEY (actor_club_id) REFERENCES clubs (id),
    CONSTRAINT fk_audit_logs_actor_referee_id FOREIGN KEY (actor_referee_id) REFERENCES referees (id),
    CONSTRAINT fk_audit_logs_federation_id FOREIGN KEY (federation_id) REFERENCES federations (id),
    CONSTRAINT fk_audit_logs_club_id FOREIGN KEY (club_id) REFERENCES clubs (id),
    CONSTRAINT fk_audit_logs_player_id FOREIGN KEY (player_id) REFERENCES players (id),
    CONSTRAINT fk_audit_logs_player_registration_id FOREIGN KEY (player_registration_id) REFERENCES player_registrations (id),
    CONSTRAINT fk_audit_logs_staff_member_id FOREIGN KEY (staff_member_id) REFERENCES staff_members (id),
    CONSTRAINT fk_audit_logs_staff_registration_id FOREIGN KEY (staff_registration_id) REFERENCES staff_registrations (id),
    CONSTRAINT fk_audit_logs_referee_id FOREIGN KEY (referee_id) REFERENCES referees (id),
    CONSTRAINT fk_audit_logs_match_id FOREIGN KEY (match_id) REFERENCES matches (id),
    CONSTRAINT fk_audit_logs_match_sheet_id FOREIGN KEY (match_sheet_id) REFERENCES match_sheets (id),
    CONSTRAINT fk_audit_logs_match_sheet_player_id FOREIGN KEY (match_sheet_player_id) REFERENCES match_sheet_players (id),
    CONSTRAINT fk_audit_logs_match_sheet_staff_id FOREIGN KEY (match_sheet_staff_id) REFERENCES match_sheet_staff (id),
    CONSTRAINT fk_audit_logs_recognition_id FOREIGN KEY (recognition_id) REFERENCES recognitions (id),
    CONSTRAINT fk_audit_logs_match_report_id FOREIGN KEY (match_report_id) REFERENCES match_reports (id),
    CONSTRAINT fk_audit_logs_match_event_id FOREIGN KEY (match_event_id) REFERENCES match_events (id),
    CONSTRAINT fk_audit_logs_photo_id FOREIGN KEY (photo_id) REFERENCES photos (id),
    CONSTRAINT fk_audit_logs_identity_document_id FOREIGN KEY (identity_document_id) REFERENCES identity_documents (id),
    CONSTRAINT chk_audit_logs_single_actor CHECK (num_nonnulls(actor_federation_id, actor_club_id, actor_referee_id) <= 1),
    CONSTRAINT chk_audit_logs_single_entity CHECK (num_nonnulls(federation_id, club_id, player_id, player_registration_id, staff_member_id, staff_registration_id, referee_id, match_id, match_sheet_id, match_sheet_player_id, match_sheet_staff_id, recognition_id, match_report_id, match_event_id, photo_id, identity_document_id) = 1),
    CONSTRAINT chk_audit_logs_action CHECK (char_length(action) > 0)
);
COMMENT ON TABLE audit_logs IS 'Append-only audit log metadata for tracked database entities.';
COMMENT ON COLUMN audit_logs.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN audit_logs.actor_federation_id IS 'Actor federation id.';
COMMENT ON COLUMN audit_logs.actor_club_id IS 'Actor club id.';
COMMENT ON COLUMN audit_logs.actor_referee_id IS 'Actor referee id.';
COMMENT ON COLUMN audit_logs.federation_id IS 'Federation id.';
COMMENT ON COLUMN audit_logs.club_id IS 'Club id.';
COMMENT ON COLUMN audit_logs.player_id IS 'Player id.';
COMMENT ON COLUMN audit_logs.player_registration_id IS 'Player registration id.';
COMMENT ON COLUMN audit_logs.staff_member_id IS 'Staff member id.';
COMMENT ON COLUMN audit_logs.staff_registration_id IS 'Staff registration id.';
COMMENT ON COLUMN audit_logs.referee_id IS 'Referee id.';
COMMENT ON COLUMN audit_logs.match_id IS 'Match id.';
COMMENT ON COLUMN audit_logs.match_sheet_id IS 'Match sheet id.';
COMMENT ON COLUMN audit_logs.match_sheet_player_id IS 'Match sheet player id.';
COMMENT ON COLUMN audit_logs.match_sheet_staff_id IS 'Match sheet staff id.';
COMMENT ON COLUMN audit_logs.recognition_id IS 'Recognition id.';
COMMENT ON COLUMN audit_logs.match_report_id IS 'Match report id.';
COMMENT ON COLUMN audit_logs.match_event_id IS 'Match event id.';
COMMENT ON COLUMN audit_logs.photo_id IS 'Photo id.';
COMMENT ON COLUMN audit_logs.identity_document_id IS 'Identity document id.';
COMMENT ON COLUMN audit_logs.action IS 'Action.';
COMMENT ON COLUMN audit_logs.occurred_at IS 'Occurred at.';
COMMENT ON COLUMN audit_logs.metadata IS 'Metadata.';
COMMENT ON COLUMN audit_logs.created_at IS 'UTC timestamp when the row was created.';
CREATE UNIQUE INDEX uq_audit_logs_action_time_entity_active ON audit_logs (action, occurred_at, federation_id, club_id, player_id, player_registration_id, staff_member_id, staff_registration_id, referee_id, match_id, match_sheet_id, match_sheet_player_id, match_sheet_staff_id, recognition_id, match_report_id, match_event_id, photo_id, identity_document_id);
CREATE INDEX idx_audit_logs_occurred_at ON audit_logs (occurred_at);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_actor_federation_id ON audit_logs (actor_federation_id);
CREATE INDEX idx_audit_logs_actor_club_id ON audit_logs (actor_club_id);
CREATE INDEX idx_audit_logs_actor_referee_id ON audit_logs (actor_referee_id);
CREATE INDEX idx_audit_logs_match_id_occurred_at ON audit_logs (match_id, occurred_at);
CREATE INDEX idx_audit_logs_player_id_occurred_at ON audit_logs (player_id, occurred_at);
CREATE TRIGGER trg_audit_logs_prevent_update BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
