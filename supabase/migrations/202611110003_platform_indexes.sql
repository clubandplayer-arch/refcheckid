-- Additive indexes for organization, import and appointment lookups.
-- Does not create accounts, send invitations or modify existing entities.
CREATE INDEX IF NOT EXISTS platform_entities_document_lookup
  ON refcheckid.entities USING gin (document jsonb_path_ops)
  WHERE repository LIKE 'platform_%';
CREATE INDEX IF NOT EXISTS auth_profiles_actor_lookup
  ON refcheckid.entities ((document->>'actorId'))
  WHERE repository='auth_profiles';

CREATE INDEX IF NOT EXISTS registration_identity_lookup
  ON refcheckid.entities USING gin (document jsonb_path_ops)
  WHERE repository IN ('player_registrations','staff_registrations','auth_profiles','matches');
