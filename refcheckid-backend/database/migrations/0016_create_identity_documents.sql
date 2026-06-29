CREATE TABLE identity_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid,
    staff_member_id uuid,
    referee_id uuid,
    document_type text NOT NULL,
    document_number text NOT NULL,
    issued_at date,
    expires_at date,
    status text NOT NULL DEFAULT 'valid',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT chk_identity_documents_timestamps CHECK (updated_at >= created_at),
    CONSTRAINT fk_identity_documents_player_id FOREIGN KEY (player_id) REFERENCES players (id),
    CONSTRAINT fk_identity_documents_staff_member_id FOREIGN KEY (staff_member_id) REFERENCES staff_members (id),
    CONSTRAINT fk_identity_documents_referee_id FOREIGN KEY (referee_id) REFERENCES referees (id),
    CONSTRAINT uq_identity_documents_player_document UNIQUE (player_id, document_type, document_number),
    CONSTRAINT uq_identity_documents_staff_document UNIQUE (staff_member_id, document_type, document_number),
    CONSTRAINT uq_identity_documents_referee_document UNIQUE (referee_id, document_type, document_number),
    CONSTRAINT chk_identity_documents_single_owner CHECK (num_nonnulls(player_id, staff_member_id, referee_id) = 1),
    CONSTRAINT chk_identity_documents_dates CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at),
    CONSTRAINT chk_identity_documents_status CHECK (status IN ('valid', 'expired', 'revoked'))
);

COMMENT ON TABLE identity_documents IS 'Identity document metadata for recognized people.';
COMMENT ON COLUMN identity_documents.id IS 'Primary UUID identifier.';
COMMENT ON COLUMN identity_documents.player_id IS 'Referenced player owner when the document belongs to a player.';
COMMENT ON COLUMN identity_documents.staff_member_id IS 'Referenced staff member owner when the document belongs to staff.';
COMMENT ON COLUMN identity_documents.referee_id IS 'Referenced referee owner when the document belongs to a referee.';
COMMENT ON COLUMN identity_documents.document_type IS 'Identity document type.';
COMMENT ON COLUMN identity_documents.document_number IS 'Identity document number.';
COMMENT ON COLUMN identity_documents.issued_at IS 'Document issue date.';
COMMENT ON COLUMN identity_documents.expires_at IS 'Document expiration date.';
COMMENT ON COLUMN identity_documents.status IS 'Document lifecycle status.';
COMMENT ON COLUMN identity_documents.created_at IS 'UTC timestamp when the row was created.';
COMMENT ON COLUMN identity_documents.updated_at IS 'UTC timestamp when the row was last updated.';
COMMENT ON COLUMN identity_documents.deleted_at IS 'UTC timestamp for soft deletion; null when active.';
CREATE INDEX idx_identity_documents_player_id ON identity_documents (player_id);
CREATE INDEX idx_identity_documents_staff_member_id ON identity_documents (staff_member_id);
CREATE INDEX idx_identity_documents_referee_id ON identity_documents (referee_id);
CREATE INDEX idx_identity_documents_number ON identity_documents (document_number);
CREATE INDEX idx_identity_documents_status ON identity_documents (status);
