import {canReadReport} from '../platform/report-access.js';
import { canReview, reviewerScope } from '../platform/photo-scopes.js';
import { PlatformStore } from '../platform/store.js';
import type { Fixture,Competition } from '../platform/types.js';
import { platformMatchAllowed } from '../platform/router.js';
import type { ApplicationContainer } from '../config/application-container.js';
import type { Match } from '../domain/index.js';
import { json, type ApiMiddleware, type AuthContext } from './http.js';
import { requireUuid } from './validation.js';

/** Resource ownership is checked on server-resolved IDs, never on claimed roles in request bodies. */
export function resourceAccess(container: ApplicationContainer): ApiMiddleware {
  return (next) => async (request) => {
    const auth = request.auth;
    const privateReportPath=request.path.startsWith('/api/v1/match-reports')||request.path.startsWith('/api/v1/audit/')||/\/(final-report|report-draft)$/.test(request.path);
    if (!auth || auth.roles.includes('admin')&&!privateReportPath || !request.path.startsWith('/api/v1/') || request.path.includes('/auth/')) return next(request);
    const r = container.repositories;
    const manager = auth.roles.includes('manager');
    const referee = auth.roles.includes('referee');
    const federation = auth.roles.includes('federation');
    let photoScopes:ReturnType<typeof reviewerScope>|undefined;
    const clubAllowed = async (id: string) => {
      if (manager) return auth.clubIds?.includes(id) ?? false;
      const club = await r.clubs.findById(id);
      if (federation){if(club&&auth.federationIds?.includes(club.federationId))return true;photoScopes??=reviewerScope(container,auth);const scopes=await photoScopes;return !!club&&(scopes.federationIds===null||scopes.federationIds.includes(club.federationId)||scopes.clubIds.includes(id));}
      if (referee) return (await r.matches.list()).some((m) => matchAllowed(auth, m) && (m.homeClubId === id || m.awayClubId === id));
      return false;
    };
    const match = async (id: string) => {
      const value = await r.matches.findById(id);
      return !!value && matchAllowed(auth, value) && (!referee || await platformMatchAllowed(container,auth.actorId,id,request.method!=='GET'));
    };
    const denied = () => json(403, { error: 'FORBIDDEN', message: 'Operation outside authorized role or resource scope.' });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const id = request.params.id;
    if (id) requireUuid(id, 'id');
    const path = request.path;
    if(path==='/api/v1/photos/upload-intent'){const registrationId=String(body.registrationId??'');const registration=await r.registrations.findById(registrationId)??await r.registrations.findStaffRegistrationById(registrationId);if(!registration||!await clubAllowed(registration.clubId))return denied();}
    if (path.startsWith('/api/v1/clubs/') && id && !await clubAllowed(id)) return denied();
    if (path.startsWith('/api/v1/federations/') && id && !auth.federationIds?.includes(id)) return denied();
    if (path.startsWith('/api/v1/referees/') && id) {
      const person = await r.referees.findById(id);
      if (!auth.refereeIds?.includes(id) && !(federation && person && auth.federationIds?.includes(person.federationId))) return denied();
    }
    if (path.startsWith('/api/v1/player-registrations/') && id) {
      const registration = await r.registrations.findById(id);
      if (!registration || !await clubAllowed(registration.clubId)) return denied();
    }
    if (path.startsWith('/api/v1/audit/')) {
      if(path!=='/api/v1/audit/by-match')return denied();
      if (!request.query.matchId || !await canReadReport(container,auth,request.query.matchId)) return denied();
    }
    if (path.startsWith('/api/v1/photos/versions/') && id) {
      const linked = (await r.seasonRegistrationPhotos.list()).filter((photo) => photo.effectiveVersionId === id);
      let allowed = false;
      for (const photo of linked) {
        const registration = await r.registrations.findPlayerRegistrationById(photo.registrationId) ?? await r.registrations.findStaffRegistrationById(photo.registrationId);
        if ((federation && auth.federationIds?.includes(photo.federationId)) || (registration && await clubAllowed(registration.clubId))) allowed = true;
      }
      for (const snapshot of await r.matchSheetPhotoSnapshots.list()) {
        if (snapshot.photoVersionId === id && snapshot.deletedAt === null && await match(snapshot.matchId)) allowed = true;
      }
      for (const approval of await r.photoApprovals.list()) {
        if (approval.photoVersionId === id && federation && await canReview(container,auth,approval)) allowed = true;
      }
      if (!allowed) return denied();
    }
    if ((path.startsWith('/api/v1/players/') || path.startsWith('/api/v1/staff-members/')) && id) {
      if (path.includes('/players/')) {
        const person = await r.players.findById(id);
        if (!person) return json(404, { error: 'PHOTO_NOT_FOUND' });
        const regs = (await r.registrations.list()).filter((reg) => reg.playerId === id);
        if (!(person && federation && auth.federationIds?.includes(person.federationId)) && !(await Promise.all(regs.map((reg) => clubAllowed(reg.clubId)))).some(Boolean)) return denied();
      } else {
        const person = await r.registrations.findStaffMemberById(id);
        let allowed = !!person && federation && !!auth.federationIds?.includes(person.federationId);
        for (const club of await r.clubs.list()) if (await clubAllowed(club.id) && (await r.registrations.listStaffRegistrationsByClub(club.id)).some((reg) => reg.staffMemberId === id)) allowed = true;
        if (!allowed) return denied();
      }
    }
    if (path === '/api/v1/federation-sync') {
      if (!federation) return denied();
      const incoming = Array.isArray(body.federations) ? body.federations as { id: string }[] : [];
      if (!incoming.length || incoming.some((f) => !auth.federationIds?.includes(f.id))) return denied();
      for (const key of ['clubs', 'players', 'staffMembers', 'referees', 'matches']) {
        if (Array.isArray(body[key]) && (body[key] as { federationId?: string }[]).some((row) => row.federationId && !auth.federationIds?.includes(row.federationId))) return denied();
      }
      const owners: Record<string, { findById(id: string): Promise<{ federationId: string } | null> }> = {
        clubs: r.clubs, players: r.players, referees: r.referees, matches: r.matches,
        staffMembers: { findById: (id) => r.registrations.findStaffMemberById(id) },
      };
      for (const [key, repository] of Object.entries(owners)) {
        if (body[key] !== undefined && !Array.isArray(body[key])) return denied();
        for (const row of (body[key] ?? []) as { id: string; federationId: string }[]) {
          requireUuid(row.id, 'id');
          if (!auth.federationIds?.includes(row.federationId)) return denied();
          const existing = await repository.findById(row.id);
          if (existing && !auth.federationIds?.includes(existing.federationId)) return denied();
        }
      }
      for (const key of ['playerRegistrations', 'staffRegistrations']) {
        const entries = body[key];
        if (entries !== undefined && !Array.isArray(entries)) return denied();
        for (const row of (entries ?? []) as { clubId: string }[]) {
          const incomingClubs = (Array.isArray(body.clubs) ? body.clubs : []) as { id: string; federationId: string }[];
          const club = incomingClubs.find((club) => club.id === row.clubId) ?? await r.clubs.findById(row.clubId);
          if (!club || !auth.federationIds?.includes(club.federationId)) return denied();
        }
      }
    }
    if (path.startsWith('/api/v1/matches/') && id) {
      if (!await match(id) || (request.method !== 'GET' && !referee && !federation)) return denied();
      if ((path.endsWith('/final-report') || path.endsWith('/report-draft')) && !referee) return denied();
    }
    if (path.startsWith('/api/v1/match-sheets/') && id) {
      const sheet = await r.matchSheets.findById(id);
      if (!sheet || !await match(sheet.matchId)) return denied();
      if (manager && !auth.clubIds?.includes(sheet.clubId)) return denied();
      if (request.method !== 'GET' && !manager && !referee) return denied();
      if ((path.endsWith('/submit') || path.endsWith('/draft')) && !manager) return denied();
    }
    if (path.startsWith('/api/v1/recognitions')) {
      let matchId = typeof body.matchId === 'string' ? body.matchId : request.query.matchId;
      if (id) matchId = (await r.recognitions.findById(id))?.matchId;
      if (!matchId || !await match(matchId) || (request.method !== 'GET' && !referee)) return denied();
    }
    if (path.startsWith('/api/v1/match-reports')) {
      const matchId = id ? (await r.matchReports.findById(id))?.matchId : typeof body.matchId === 'string' ? body.matchId : request.query.matchId;
      if(request.method==='GET'){
        if(matchId){if(!await canReadReport(container,auth,matchId))return denied();}
        else if(!federation)return denied();
      }else{if(!matchId||!referee||!await match(matchId)||!await canReadReport(container,auth,matchId))return denied();}
      if (typeof body.refereeId === 'string' && !auth.refereeIds?.includes(body.refereeId)) return denied();
    }
    if (path.startsWith('/api/v1/registrations/') && id) {
      const registration = await r.registrations.findPlayerRegistrationById(id) ?? await r.registrations.findStaffRegistrationById(id);
      if (!registration || !await clubAllowed(registration.clubId)) return denied();
    }
    const response = await next(request);
    const enrichMatch = async (row: Record<string, unknown>) => {
      const db=new PlatformStore(container.store);const fixture=(await db.find<Fixture>('fixtures',{matchId:row.id}))[0];
      const competition=fixture?await db.get<Competition>('competitions',fixture.competitionId):null;
      return {...row, homeClubName:(await r.clubs.findById(String(row.homeClubId)))?.name,
        awayClubName:(await r.clubs.findById(String(row.awayClubId)))?.name,
        ...(competition?{platformFixtureId:fixture?.id,sport:competition.sport,lineupRules:competition.rules,competitionName:competition.name}:{}),
      };
    };
    if (request.method === 'GET' && response.status === 200 && path.startsWith('/api/v1/matches/') && path.split('/').length === 5 && response.body) {
      return { ...response, body: await enrichMatch(response.body as Record<string, unknown>) };
    }
    if (request.method !== 'GET' || response.status !== 200 || !Array.isArray(response.body)) return response;
    const filter = async (row: Record<string, string>) => {
      if(path==='/api/v1/match-reports')return canReadReport(container,auth,row.matchId);
      if(path==='/api/v1/identity-documents')return false;
      if (path === '/api/v1/matches') return matchAllowed(auth, row as unknown as Match) && (!referee || await platformMatchAllowed(container,auth.actorId,row.id));
      if (path === '/api/v1/match-sheets') return manager ? !!auth.clubIds?.includes(row.clubId) : match(row.matchId);
      if (path === '/api/v1/clubs') return clubAllowed(row.id);
      if (path === '/api/v1/federations') return !!auth.federationIds?.includes(row.id);
      if (path === '/api/v1/referees') return referee ? !!auth.refereeIds?.includes(row.id) : federation && !!auth.federationIds?.includes(row.federationId);
      if (path === '/api/v1/player-registrations' || path === '/api/v1/staff-registrations') return clubAllowed(row.clubId);
      if (path === '/api/v1/players') {
        if (federation) return !!auth.federationIds?.includes(row.federationId);
        for (const reg of await r.registrations.list()) if (reg.playerId === row.id && await clubAllowed(reg.clubId)) return true;
        return false;
      }
      if (path === '/api/v1/staff-members') {
        if (federation) return !!auth.federationIds?.includes(row.federationId);
        for (const club of await r.clubs.list()) {
          if (await clubAllowed(club.id) && (await r.registrations.listStaffRegistrationsByClub(club.id)).some((reg) => reg.staffMemberId === row.id)) return true;
        }
        return false;
      }
      return true;
    };
    const allowed = await Promise.all(response.body.map(filter));
    const rows = response.body.filter((_, index) => allowed[index]) as Record<string, unknown>[];
    return { ...response, body: path === '/api/v1/matches' ? await Promise.all(rows.map(enrichMatch)) : rows };
  };
}

export function matchAllowed(auth: AuthContext, match: Match): boolean {
  if (auth.roles.includes('admin')) return true;
  if (auth.roles.includes('federation') && auth.federationIds?.includes(match.federationId)) return true;
  if (auth.roles.includes('referee')) return !!auth.authorizedMatchIds?.includes(match.id) || !!match.refereeId && !!auth.refereeIds?.includes(match.refereeId);
  return auth.roles.includes('manager') && !!auth.clubIds?.some((id) => id === match.homeClubId || id === match.awayClubId);
}
