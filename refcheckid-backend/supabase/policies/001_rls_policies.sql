ALTER TABLE federations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_sheet_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_sheet_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY federations_select ON federations FOR SELECT TO authenticated USING (app_security.can_access_federation(id));
CREATE POLICY federations_insert ON federations FOR INSERT TO authenticated WITH CHECK (app_security.is_platform_admin());
CREATE POLICY federations_update ON federations FOR UPDATE TO authenticated USING (app_security.can_manage_federation(id)) WITH CHECK (app_security.can_manage_federation(id));
CREATE POLICY federations_delete ON federations FOR DELETE TO authenticated USING (app_security.is_platform_admin());

CREATE POLICY clubs_select ON clubs FOR SELECT TO authenticated USING (app_security.can_access_club(id));
CREATE POLICY clubs_insert ON clubs FOR INSERT TO authenticated WITH CHECK (app_security.can_manage_federation(federation_id));
CREATE POLICY clubs_update ON clubs FOR UPDATE TO authenticated USING (app_security.can_manage_club(id)) WITH CHECK (app_security.can_manage_club(id));
CREATE POLICY clubs_delete ON clubs FOR DELETE TO authenticated USING (app_security.can_manage_club(id));

CREATE POLICY players_select ON players FOR SELECT TO authenticated USING (app_security.can_access_federation(federation_id));
CREATE POLICY players_insert ON players FOR INSERT TO authenticated WITH CHECK (app_security.can_manage_federation(federation_id));
CREATE POLICY players_update ON players FOR UPDATE TO authenticated USING (app_security.can_manage_federation(federation_id)) WITH CHECK (app_security.can_manage_federation(federation_id));
CREATE POLICY players_delete ON players FOR DELETE TO authenticated USING (app_security.can_manage_federation(federation_id));

CREATE POLICY player_registrations_select ON player_registrations FOR SELECT TO authenticated USING (app_security.can_access_club(club_id));
CREATE POLICY player_registrations_insert ON player_registrations FOR INSERT TO authenticated WITH CHECK (app_security.can_manage_club(club_id));
CREATE POLICY player_registrations_update ON player_registrations FOR UPDATE TO authenticated USING (app_security.can_manage_club(club_id)) WITH CHECK (app_security.can_manage_club(club_id));
CREATE POLICY player_registrations_delete ON player_registrations FOR DELETE TO authenticated USING (app_security.can_manage_club(club_id));

CREATE POLICY staff_members_select ON staff_members FOR SELECT TO authenticated USING (app_security.can_access_federation(federation_id));
CREATE POLICY staff_members_insert ON staff_members FOR INSERT TO authenticated WITH CHECK (app_security.can_manage_federation(federation_id));
CREATE POLICY staff_members_update ON staff_members FOR UPDATE TO authenticated USING (app_security.can_manage_federation(federation_id)) WITH CHECK (app_security.can_manage_federation(federation_id));
CREATE POLICY staff_members_delete ON staff_members FOR DELETE TO authenticated USING (app_security.can_manage_federation(federation_id));

CREATE POLICY staff_registrations_select ON staff_registrations FOR SELECT TO authenticated USING (app_security.can_access_club(club_id));
CREATE POLICY staff_registrations_insert ON staff_registrations FOR INSERT TO authenticated WITH CHECK (app_security.can_manage_club(club_id));
CREATE POLICY staff_registrations_update ON staff_registrations FOR UPDATE TO authenticated USING (app_security.can_manage_club(club_id)) WITH CHECK (app_security.can_manage_club(club_id));
CREATE POLICY staff_registrations_delete ON staff_registrations FOR DELETE TO authenticated USING (app_security.can_manage_club(club_id));

CREATE POLICY referees_select ON referees FOR SELECT TO authenticated USING (app_security.can_access_referee(id));
CREATE POLICY referees_insert ON referees FOR INSERT TO authenticated WITH CHECK (app_security.can_manage_federation(federation_id));
CREATE POLICY referees_update ON referees FOR UPDATE TO authenticated USING (app_security.can_manage_federation(federation_id)) WITH CHECK (app_security.can_manage_federation(federation_id));
CREATE POLICY referees_delete ON referees FOR DELETE TO authenticated USING (app_security.can_manage_federation(federation_id));

CREATE POLICY matches_select ON matches FOR SELECT TO authenticated USING (app_security.can_access_match(id));
CREATE POLICY matches_insert ON matches FOR INSERT TO authenticated WITH CHECK (app_security.can_manage_federation(federation_id));
CREATE POLICY matches_update ON matches FOR UPDATE TO authenticated USING (app_security.can_manage_federation(federation_id) OR app_security.can_access_referee(referee_id)) WITH CHECK (app_security.can_manage_federation(federation_id) OR app_security.can_access_referee(referee_id));
CREATE POLICY matches_delete ON matches FOR DELETE TO authenticated USING (app_security.can_manage_federation(federation_id));

CREATE POLICY match_sheets_select ON match_sheets FOR SELECT TO authenticated USING (app_security.can_access_match_sheet(id));
CREATE POLICY match_sheets_insert ON match_sheets FOR INSERT TO authenticated WITH CHECK (app_security.can_manage_club(club_id));
CREATE POLICY match_sheets_update ON match_sheets FOR UPDATE TO authenticated USING (app_security.is_platform_admin()) WITH CHECK (app_security.is_platform_admin());
CREATE POLICY match_sheets_delete ON match_sheets FOR DELETE TO authenticated USING (app_security.is_platform_admin());

CREATE POLICY match_sheet_players_select ON match_sheet_players FOR SELECT TO authenticated USING (app_security.can_access_match_sheet(match_sheet_id));
CREATE POLICY match_sheet_players_insert ON match_sheet_players FOR INSERT TO authenticated WITH CHECK (app_security.can_access_match_sheet(match_sheet_id));
CREATE POLICY match_sheet_players_update ON match_sheet_players FOR UPDATE TO authenticated USING (app_security.is_platform_admin()) WITH CHECK (app_security.is_platform_admin());
CREATE POLICY match_sheet_players_delete ON match_sheet_players FOR DELETE TO authenticated USING (app_security.is_platform_admin());

CREATE POLICY match_sheet_staff_select ON match_sheet_staff FOR SELECT TO authenticated USING (app_security.can_access_match_sheet(match_sheet_id));
CREATE POLICY match_sheet_staff_insert ON match_sheet_staff FOR INSERT TO authenticated WITH CHECK (app_security.can_access_match_sheet(match_sheet_id));
CREATE POLICY match_sheet_staff_update ON match_sheet_staff FOR UPDATE TO authenticated USING (app_security.is_platform_admin()) WITH CHECK (app_security.is_platform_admin());
CREATE POLICY match_sheet_staff_delete ON match_sheet_staff FOR DELETE TO authenticated USING (app_security.is_platform_admin());

CREATE POLICY recognitions_select ON recognitions FOR SELECT TO authenticated USING (app_security.can_access_match(match_id));
CREATE POLICY recognitions_insert ON recognitions FOR INSERT TO authenticated WITH CHECK (app_security.can_access_referee(referee_id) AND app_security.can_access_match(match_id));
CREATE POLICY recognitions_update ON recognitions FOR UPDATE TO authenticated USING (app_security.is_platform_admin()) WITH CHECK (app_security.is_platform_admin());
CREATE POLICY recognitions_delete ON recognitions FOR DELETE TO authenticated USING (app_security.is_platform_admin());

CREATE POLICY match_reports_select ON match_reports FOR SELECT TO authenticated USING (app_security.can_access_match(match_id));
CREATE POLICY match_reports_insert ON match_reports FOR INSERT TO authenticated WITH CHECK (app_security.can_access_referee(referee_id) AND app_security.can_access_match(match_id));
CREATE POLICY match_reports_update ON match_reports FOR UPDATE TO authenticated USING (app_security.is_platform_admin()) WITH CHECK (app_security.is_platform_admin());
CREATE POLICY match_reports_delete ON match_reports FOR DELETE TO authenticated USING (app_security.is_platform_admin());

CREATE POLICY match_events_select ON match_events FOR SELECT TO authenticated USING (app_security.can_access_match(match_id));
CREATE POLICY match_events_insert ON match_events FOR INSERT TO authenticated WITH CHECK (app_security.can_access_match(match_id));
CREATE POLICY match_events_update ON match_events FOR UPDATE TO authenticated USING (app_security.is_platform_admin()) WITH CHECK (app_security.is_platform_admin());
CREATE POLICY match_events_delete ON match_events FOR DELETE TO authenticated USING (app_security.is_platform_admin());

CREATE POLICY photos_select ON photos FOR SELECT TO authenticated USING (
    app_security.is_platform_admin()
    OR app_security.can_access_match(match_id)
    OR app_security.can_access_referee(referee_id)
    OR EXISTS (SELECT 1 FROM players WHERE players.id = photos.player_id AND app_security.can_access_federation(players.federation_id))
    OR EXISTS (SELECT 1 FROM staff_members WHERE staff_members.id = photos.staff_member_id AND app_security.can_access_federation(staff_members.federation_id))
    OR EXISTS (SELECT 1 FROM match_reports WHERE match_reports.id = photos.match_report_id AND app_security.can_access_match(match_reports.match_id))
);
CREATE POLICY photos_insert ON photos FOR INSERT TO authenticated WITH CHECK (app_security.is_platform_admin() OR app_security.is_federation_admin() OR app_security.is_club_admin() OR app_security.is_referee());
CREATE POLICY photos_update ON photos FOR UPDATE TO authenticated USING (app_security.is_platform_admin()) WITH CHECK (app_security.is_platform_admin());
CREATE POLICY photos_delete ON photos FOR DELETE TO authenticated USING (app_security.is_platform_admin());

CREATE POLICY identity_documents_select ON identity_documents FOR SELECT TO authenticated USING (
    app_security.is_platform_admin()
    OR app_security.can_access_referee(referee_id)
    OR EXISTS (SELECT 1 FROM players WHERE players.id = identity_documents.player_id AND app_security.can_access_federation(players.federation_id))
    OR EXISTS (SELECT 1 FROM staff_members WHERE staff_members.id = identity_documents.staff_member_id AND app_security.can_access_federation(staff_members.federation_id))
);
CREATE POLICY identity_documents_insert ON identity_documents FOR INSERT TO authenticated WITH CHECK (app_security.is_platform_admin() OR app_security.is_federation_admin());
CREATE POLICY identity_documents_update ON identity_documents FOR UPDATE TO authenticated USING (app_security.is_platform_admin()) WITH CHECK (app_security.is_platform_admin());
CREATE POLICY identity_documents_delete ON identity_documents FOR DELETE TO authenticated USING (app_security.is_platform_admin());

CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated USING (app_security.is_platform_admin() OR app_security.is_federation_admin());
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY audit_logs_update_immutable ON audit_logs FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY audit_logs_delete_immutable ON audit_logs FOR DELETE TO authenticated USING (false);
