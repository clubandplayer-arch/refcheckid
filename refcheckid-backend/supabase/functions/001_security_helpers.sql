CREATE SCHEMA IF NOT EXISTS app_security;

COMMENT ON SCHEMA app_security IS 'Supabase security helper functions for RefCheckID RLS policies.';

CREATE TABLE IF NOT EXISTS app_security.platform_admins (
    user_id uuid PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    disabled_at timestamptz
);

COMMENT ON TABLE app_security.platform_admins IS 'Database-verified allowlist for platform administrator Supabase users.';
COMMENT ON COLUMN app_security.platform_admins.user_id IS 'Supabase auth user identifier allowed to act as platform admin.';
COMMENT ON COLUMN app_security.platform_admins.enabled IS 'Whether the platform administrator grant is active.';
COMMENT ON COLUMN app_security.platform_admins.created_at IS 'UTC timestamp when the platform administrator grant was created.';
COMMENT ON COLUMN app_security.platform_admins.disabled_at IS 'UTC timestamp when the platform administrator grant was disabled.';


CREATE OR REPLACE FUNCTION app_security.jwt_text(claim_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(auth.jwt() ->> claim_name, '')
$$;

CREATE OR REPLACE FUNCTION app_security.jwt_uuid(claim_name text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(auth.jwt() ->> claim_name, '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_security.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() ->> 'role',
        'authenticated'
    )
$$;

CREATE OR REPLACE FUNCTION app_security.current_federation_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(
        nullif(auth.jwt() -> 'app_metadata' ->> 'federation_id', '')::uuid,
        app_security.jwt_uuid('federation_id')
    )
$$;

CREATE OR REPLACE FUNCTION app_security.current_club_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(
        nullif(auth.jwt() -> 'app_metadata' ->> 'club_id', '')::uuid,
        app_security.jwt_uuid('club_id')
    )
$$;

CREATE OR REPLACE FUNCTION app_security.current_referee_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(
        nullif(auth.jwt() -> 'app_metadata' ->> 'referee_id', '')::uuid,
        app_security.jwt_uuid('referee_id')
    )
$$;

CREATE OR REPLACE FUNCTION app_security.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app_security, public, auth
AS $$
    SELECT auth.uid() IS NOT NULL
        AND app_security.current_app_role() = 'platform_admin'
        AND EXISTS (
            SELECT 1
            FROM app_security.platform_admins
            WHERE platform_admins.user_id = auth.uid()
              AND platform_admins.enabled = true
              AND platform_admins.disabled_at IS NULL
        )
$$;

CREATE OR REPLACE FUNCTION app_security.is_federation_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.current_app_role() = 'federation_admin'
$$;

CREATE OR REPLACE FUNCTION app_security.is_club_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.current_app_role() = 'club_admin'
$$;

CREATE OR REPLACE FUNCTION app_security.is_referee()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.current_app_role() = 'referee'
$$;

CREATE OR REPLACE FUNCTION app_security.can_access_federation(target_federation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.is_platform_admin()
        OR target_federation_id = app_security.current_federation_id()
$$;

CREATE OR REPLACE FUNCTION app_security.can_access_club(target_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.is_platform_admin()
        OR target_club_id = app_security.current_club_id()
        OR EXISTS (
            SELECT 1
            FROM clubs
            WHERE clubs.id = target_club_id
              AND app_security.can_access_federation(clubs.federation_id)
        )
$$;

CREATE OR REPLACE FUNCTION app_security.can_access_referee(target_referee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.is_platform_admin()
        OR target_referee_id = app_security.current_referee_id()
        OR EXISTS (
            SELECT 1
            FROM referees
            WHERE referees.id = target_referee_id
              AND app_security.can_access_federation(referees.federation_id)
        )
$$;

CREATE OR REPLACE FUNCTION app_security.can_access_match(target_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.is_platform_admin()
        OR EXISTS (
            SELECT 1
            FROM matches
            WHERE matches.id = target_match_id
              AND (
                    app_security.can_access_federation(matches.federation_id)
                 OR app_security.can_access_club(matches.home_club_id)
                 OR app_security.can_access_club(matches.away_club_id)
                 OR app_security.can_access_referee(matches.referee_id)
              )
        )
$$;

CREATE OR REPLACE FUNCTION app_security.can_access_match_sheet(target_match_sheet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.is_platform_admin()
        OR EXISTS (
            SELECT 1
            FROM match_sheets
            WHERE match_sheets.id = target_match_sheet_id
              AND (
                    app_security.can_access_match(match_sheets.match_id)
                 OR app_security.can_access_club(match_sheets.club_id)
              )
        )
$$;

CREATE OR REPLACE FUNCTION app_security.can_manage_federation(target_federation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.is_platform_admin()
        OR (app_security.is_federation_admin() AND target_federation_id = app_security.current_federation_id())
$$;

CREATE OR REPLACE FUNCTION app_security.can_manage_club(target_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_security.is_platform_admin()
        OR (app_security.is_club_admin() AND target_club_id = app_security.current_club_id())
        OR EXISTS (
            SELECT 1
            FROM clubs
            WHERE clubs.id = target_club_id
              AND app_security.can_manage_federation(clubs.federation_id)
        )
$$;

REVOKE ALL ON SCHEMA app_security FROM anon;
REVOKE ALL ON TABLE app_security.platform_admins FROM anon, authenticated;
GRANT USAGE ON SCHEMA app_security TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app_security.platform_admins TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_security TO authenticated, service_role;
