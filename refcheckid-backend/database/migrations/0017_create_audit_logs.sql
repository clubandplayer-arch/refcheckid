CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_federation_id uuid,
    actor_club_id uuid,
    actor_referee_id uuid,
    action text NOT NULL,
    entity_table text NOT NULL,
    entity_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_audit_logs_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_audit_logs_actor_federation_id FOREIGN KEY (actor_federation_id) REFERENCES federations (id),
    CONSTRAINT fk_audit_logs_actor_club_id FOREIGN KEY (actor_club_id) REFERENCES clubs (id),
    CONSTRAINT fk_audit_logs_actor_referee_id FOREIGN KEY (actor_referee_id) REFERENCES referees (id),
    CONSTRAINT uq_audit_logs_entity_action_time UNIQUE (entity_table, entity_id, action, occurred_at),
    CONSTRAINT chk_audit_logs_single_actor CHECK (num_nonnulls(actor_federation_id, actor_club_id, actor_referee_id) <= 1),
    CONSTRAINT chk_audit_logs_action CHECK (char_length(action) > 0),
    CONSTRAINT chk_audit_logs_entity_table CHECK (char_length(entity_table) > 0)
);

COMMENT ON TABLE audit_logs IS 'Append-only audit log metadata for tracked database entities.';
COMMENT ON COLUMN audit_logs.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN audit_logs.actor_federation_id IS 'Referenced federation actor when applicable.';
COMMENT ON COLUMN audit_logs.actor_club_id IS 'Referenced club actor when applicable.';
COMMENT ON COLUMN audit_logs.actor_referee_id IS 'Referenced referee actor when applicable.';
COMMENT ON COLUMN audit_logs.action IS 'Audited action name.';
COMMENT ON COLUMN audit_logs.entity_table IS 'Audited entity table name.';
COMMENT ON COLUMN audit_logs.entity_id IS 'Audited entity UUID.';
COMMENT ON COLUMN audit_logs.occurred_at IS 'UTC timestamp when the audited action occurred.';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional audit metadata.';
COMMENT ON COLUMN audit_logs.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN audit_logs.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN audit_logs.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE INDEX idx_audit_logs_actor_federation_id ON audit_logs (actor_federation_id);
CREATE INDEX idx_audit_logs_actor_club_id ON audit_logs (actor_club_id);
CREATE INDEX idx_audit_logs_actor_referee_id ON audit_logs (actor_referee_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_table, entity_id);
CREATE INDEX idx_audit_logs_occurred_at ON audit_logs (occurred_at);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
