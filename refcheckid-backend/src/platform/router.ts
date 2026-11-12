import type { ApplicationContainer } from '../config/application-container.js';
import { json, type ApiRouter, type ApiHandler, type ApiRequest } from '../api/http.js';
import { PlatformError, text } from './organizations.js';
import { Profiles } from './profiles.js';
import { Imports } from './imports.js';
import { importColumns } from './import-files.js';
import { activateInvitation } from './invitations.js';
import { PlatformStore } from './store.js';
import { appointmentValid } from './appointments.js';
import type {
  Team,
  Entry,
  Unit,
  Organization,
  Official,
  Fixture,
  Appointment,
  Invitation,
  Competition,
  GameSummary,
  Notification,
} from './types.js';

const body = (request: ApiRequest): Record<string, unknown> => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body))
    throw new PlatformError(400, 'Dati non validi.');
  return request.body as Record<string, unknown>;
};
export function platformHandler(operation: ApiHandler): ApiHandler {
  return async (request) => {
    try {
      return await operation(request);
    } catch (error) {
      if (error instanceof PlatformError)
        return json(error.status, { error: 'PLATFORM_ERROR', message: error.message });
      throw error;
    }
  };
}
export function registerPlatformRoutes(app: ApplicationContainer, router: ApiRouter) {
  const service = (request: ApiRequest) => {
    if (!request.auth) throw new PlatformError(401, 'Accedi per continuare.');
    return new Imports(app, request.auth);
  };
  const profiles = (request: ApiRequest) => new Profiles(app,service(request).auth);
  router.register('GET','/api/v1/platform/profiles/context',platformHandler(async request=>json(200,await profiles(request).contextProfiles())));
  router.register('GET','/api/v1/platform/profiles/:kind/:id',platformHandler(async request=>json(200,await profiles(request).getProfile(request.params.kind!,request.params.id!))));
  router.register('POST','/api/v1/platform/profiles/:kind/:id',platformHandler(async request=>json(200,await profiles(request).save(request.params.kind!,request.params.id!,body(request)))));
  router.register('GET','/api/v1/platform/readiness',platformHandler(async request=>{
    const s=service(request);if(!s.auth.roles.some(role=>['admin','federation'].includes(role)))throw new PlatformError(403,'Accesso federale richiesto.');
    return json(200,{commit:process.env.VERCEL_GIT_COMMIT_SHA??'local',environment:process.env.REFCHECKID_DATA_ENV??'local',resultArchiveIndex:await app.store.resultArchiveReady?.()??null,platformAdminConfigured:(await app.store.list<{role:string;enabled:boolean}>('auth_profiles')).some(row=>row.role==='admin'&&row.enabled),publishedCompetitions:(await s.db.find('publication',{mode:'public',consent:true})).length});
  }));
  router.register('GET','/api/v1/public/games/:id/logos/:side',platformHandler(async request=>{
    const s=new Imports(app,{actorId:'public',roles:[]});await s.publicFixture(request.params.id!);
    if(!['home','away'].includes(request.params.side!))throw new PlatformError(404,'Logo non trovato.');
    const fixture=(await s.db.get<Fixture>('fixtures',request.params.id!))!,match=(await app.repositories.matches.findById(fixture.matchId))!;
    const row=await new Profiles(app,s.auth).raw('club',request.params.side==='home'?match.homeClubId:match.awayClubId);
    if(!row?.imageKey)throw new PlatformError(404,'Logo non disponibile.');
    return {status:200,body:await app.objectStores.photos.readObject(row.imageKey),headers:{'content-type':'image/webp','cache-control':'no-store'}};
  }));
  router.register(
    'POST',
    '/api/v1/platform/activate',
    platformHandler(async (request) => json(200, await activateInvitation(app, body(request)))),
  );
  router.register(
    'GET',
    '/api/v1/platform/context',
    platformHandler(async (request) => json(200, await service(request).context())),
  );
  router.register(
    'GET',
    '/api/v1/platform/units',
    platformHandler(async (request) =>
      json(200, await service(request).units(text(request.query, 'organizationId'))),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/competitions/:id',
    platformHandler(async (request) =>
      json(200, await service(request).competition(request.params.id!, 'read')),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/competitions/:id/eligible-teams',
    platformHandler(async (request) => {
      const s = service(request),
        competition = await s.competition(request.params.id!, 'competitions');
      return json(
        200,
        await s.db.page<Team>(
          'teams',
          {
            organizationId: competition.organizationId,
            sport: competition.sport,
            season: competition.season,
          },
          request.query.cursor,
          request.query.search,
        ),
      );
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/competitions/:id/entries',
    platformHandler(async (request) => {
      const s = service(request),
        competition = await s.competition(request.params.id!, 'read');
      const page = await s.db.page<Entry>(
        'entries',
        { competitionId: competition.id },
        request.query.cursor,
        request.query.search,
      );
      const items = [];
      for (const entry of page.items) {
        const team = await s.db.get<Team>('teams', entry.teamId);
        items.push({
          ...entry,
          name: team?.name ?? entry.name,
          code: team?.code ?? entry.code,
          season: team?.season ?? entry.season,
        });
      }
      return json(200, { ...page, items });
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/competitions',
    platformHandler(async (request) => {
      const rows = await service(request).listCompetitions(
        text(request.query, 'organizationId'),
        text(request.query, 'unitId'),
      );
      const items = rows
        .filter(
          (r) =>
            (!request.query.cursor || r.id > request.query.cursor) &&
            (!request.query.search ||
              r.name.toLowerCase().includes(request.query.search.toLowerCase())),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      return json(200, {
        total: rows.length,
        items: items.slice(0, 50),
        nextCursor: items.length > 50 ? items[49].id : null,
      });
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/import-models',
    platformHandler((request) => {
      service(request);
      return json(200, importColumns);
    }),
  );
  router.register(
    'POST',
    '/api/v1/platform/imports/upload',
    platformHandler(async (request) => json(201, await service(request).upload(body(request)))),
  );
  router.register(
    'POST',
    '/api/v1/platform/imports/prepare',
    platformHandler(async (request) => json(201, await service(request).prepare(body(request)))),
  );
  router.register(
    'GET',
    '/api/v1/platform/imports/:id',
    platformHandler(async (request) => json(200, await service(request).job(request.params.id!))),
  );
  router.register(
    'GET',
    '/api/v1/platform/imports/:id/rows',
    platformHandler(async (request) => {
      const s = service(request);
      await s.job(request.params.id!);
      return json(
        200,
        await s.db.page('import_rows', { jobId: request.params.id }, request.query.cursor),
      );
    }),
  );
  router.register(
    'POST',
    '/api/v1/platform/imports/:id/advance',
    platformHandler(async (request) =>
      json(
        200,
        await service(request).runAdvance(request.params.id!, text(body(request), 'action')),
      ),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/directory',
    platformHandler(async (request) => {
      const s = service(request);
      await s.scope(
        text(request.query, 'organizationId'),
        text(request.query, 'unitId'),
        'structure',
      );
      const page = await s.db.page<Organization>(
        'organizations',
        {},
        request.query.cursor,
        request.query.search,
      );
      return json(200, {
        ...page,
        items: page.items.map(({ id, name, kind, rootUnitId }) => ({ id, name, kind, rootUnitId })),
      });
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/directory/:id/units',
    platformHandler(async (request) => {
      const s = service(request);
      await s.scope(
        text(request.query, 'organizationId'),
        text(request.query, 'unitId'),
        'structure',
      );
      const page = await s.db.page<Unit>(
        'units',
        { organizationId: request.params.id },
        request.query.cursor,
        request.query.search,
      );
      return json(200, {
        ...page,
        items: page.items.map(({ id, name, parentId, territory }) => ({
          id,
          name,
          parentId,
          territory,
        })),
      });
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/legacy-clubs',
    platformHandler(async (request) => {
      const s = service(request),
        org = await s.scope(
          text(request.query, 'organizationId'),
          text(request.query, 'unitId'),
          'people',
        );
      await s.scope(org.id, org.rootUnitId, 'people');
      const rows = app.store.find
        ? await app.store.find<{ id: string; name: string }>('clubs', {
            federationId: org.federationId,
          })
        : (await app.repositories.clubs.list()).filter(
            (row) => row.federationId === org.federationId,
          );
      return json(
        200,
        rows.map(({ id, name }) => ({ id, name })),
      );
    }),
  );
  const creators = {
    organizations: 'create',
    units: 'createUnit',
    competitions: 'createCompetition',
    clubs: 'createClub',
    teams: 'createTeam',
    entries: 'createEntry',
    officials: 'createOfficial',
    fixtures: 'createFixture',
    delegations: 'createDelegation',
    invitations: 'createInvitation',
    appointments: 'createAppointment',
    unavailability: 'addUnavailability',
    'squad-members': 'assignSquad',
  } as const;
  for (const [path, method] of Object.entries(creators))
    router.register(
      'POST',
      `/api/v1/platform/${path}`,
      platformHandler(async (request) => json(201, await service(request)[method](body(request)))),
    );
  router.register(
    'GET',
    '/api/v1/platform/entities/:kind',
    platformHandler(async (request) => {
      const s = service(request),
        kind = request.params.kind!;
      if (
        ![
          'clubs',
          'teams',
          'officials',
          'memberships',
          'invitations',
          'delegations',
          'unavailability',
          'imports',
          'people',
        ].includes(kind)
      )
        throw new PlatformError(404, 'Elenco non disponibile.');
      const organizationId = text(request.query, 'organizationId'),
        unitId = text(request.query, 'unitId');
      await s.scope(
        organizationId,
        unitId,
        kind === 'people'
          ? 'people'
          : kind === 'invitations' && request.query.role === 'referee'
            ? 'people'
            : ['memberships', 'invitations', 'delegations'].includes(kind)
              ? 'structure'
              : 'read',
      );
      const page = await s.db.page(
        kind,
        {
          organizationId,
          unitId,
          ...(kind === 'invitations' && request.query.role === 'referee'
            ? { role: 'referee' }
            : {}),
        },
        request.query.cursor,
        request.query.search,
      );
      if (kind === 'memberships') {
        const items = [];
        for (const row of page.items) {
          const value = row as typeof row & { actorId: string };
          const profiles = app.store.find
            ? await app.store.find<{ displayName: string }>('auth_profiles', {
                actorId: value.actorId,
              })
            : [];
          items.push({
            ...row,
            displayName:
              profiles[0]?.displayName ??
              (value.actorId === request.auth?.actorId ? 'Il tuo account' : 'Operatore'),
          });
        }
        return json(200, { ...page, items });
      }
      if (kind === 'delegations') {
        const items = [];
        for (const row of page.items) {
          const value = row as typeof row & { competitionId: string; recipientUnitId: string };
          items.push({
            ...row,
            competitionName:
              (await s.db.get<Competition>('competitions', value.competitionId))?.name ??
              'Campionato',
            recipientName:
              (await s.db.get<Unit>('units', value.recipientUnitId))?.name ?? 'Struttura',
          });
        }
        return json(200, { ...page, items });
      }
      return json(200, {
        ...page,
        items: page.items.map((row) => {
          if (kind !== 'invitations') return row;
          const safe = { ...row } as Partial<Invitation>;
          delete safe.tokenHash;
          return safe;
        }),
      });
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/fixtures',
    platformHandler(async (request) => {
      const s = service(request),
        competition = await s.competition(text(request.query, 'competitionId'), 'read');
      const page = await s.db.page<Fixture>(
        'fixtures',
        { competitionId: competition.id },
        request.query.cursor,
        request.query.search,
      );
      await app.store.prefetch?.(
        page.items.flatMap((row) => [
          { repository: 'platform_teams', id: row.homeTeamId },
          { repository: 'platform_teams', id: row.awayTeamId },
          { repository: 'platform_summaries', id: row.id },
        ]),
      );
      const items = [];
      for (const row of page.items)
        items.push({
          ...row,
          homeName: (await s.db.get<Team>('teams', row.homeTeamId))?.name ?? 'Casa',
          awayName: (await s.db.get<Team>('teams', row.awayTeamId))?.name ?? 'Ospite',
          summary: await s.db.get<GameSummary>('summaries', row.id),
        });
      return json(200, { ...page, items, serverTime: new Date().toISOString() });
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/appointments',
    platformHandler(async (request) => {
      const s = service(request),
        competition = await s.competition(text(request.query, 'competitionId'), 'read');
      let scope: Record<string, unknown> = { competitionId: competition.id };
      try {
        await s.scope(competition.organizationId, competition.unitId, 'read');
      } catch (error) {
        if (!(error instanceof PlatformError && error.status === 403)) throw error;
        const organizationId = text(request.query, 'organizationId'),
          unitId = text(request.query, 'unitId');
        await s.scope(organizationId, unitId, 'read');
        scope = { ...scope, organizationId, unitId };
      }
      const page = await s.db.page<Appointment>(
        'appointments',
        scope,
        request.query.cursor,
        request.query.search,
      );
      await app.store.prefetch?.(
        page.items.map((row) => ({ repository: 'platform_officials', id: row.officialId })),
      );
      const items = [];
      for (const row of page.items) {
        const official = await s.db.get<Official>('officials', row.officialId);
        items.push({
          ...row,
          officialName: official ? `${official.firstName} ${official.lastName}` : 'Arbitro',
        });
      }
      return json(200, { ...page, items });
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/squads/:id',
    platformHandler(async (request) =>
      json(200, await service(request).squadRoster(request.params.id!, request.query.cursor)),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/squad-members/:id/revoke',
    platformHandler(async (request) =>
      json(200, await service(request).removeSquadMember(request.params.id!)),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/match-roster/:id',
    platformHandler(async (request) =>
      json(
        200,
        await service(request).matchRoster(request.params.id!, text(request.query, 'clubId')),
      ),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/people/:id/status',
    platformHandler(async (request) =>
      json(
        200,
        await service(request).changePersonStatus(
          request.params.id!,
          text(body(request), 'status'),
        ),
      ),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/my-officials',
    platformHandler(async (request) =>
      json(
        200,
        await service(request).db.find<Official>('officials', {
          actorId: request.auth!.actorId,
          active: true,
        }),
      ),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/officials/:id/status',
    platformHandler(async (request) => {
      const value = body(request);
      if (typeof value.active !== 'boolean') throw new PlatformError(400, 'Stato non valido.');
      return json(200, await service(request).setOfficialStatus(request.params.id!, value.active));
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/my-appointments',
    platformHandler(async (request) =>
      json(200, await service(request).mine(request.query.cursor)),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/notifications',
    platformHandler(async (request) =>
      json(
        200,
        await service(request).db.page(
          'notifications',
          { actorId: request.auth!.actorId },
          request.query.cursor,
        ),
      ),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/notifications/:id/read',
    platformHandler(async (request) => {
      const s = service(request),
        notice = await s.db.get<Notification>('notifications', request.params.id!);
      if (!notice || notice.actorId !== request.auth!.actorId)
        throw new PlatformError(404, 'Comunicazione non trovata.');
      return json(
        200,
        await s.db.update<Notification>('notifications', notice.id, {
          readAt: new Date().toISOString(),
        }),
      );
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/match-game/:id',
    platformHandler(async (request) => {
      const s = service(request);
      const fixture = (await s.db.find<Fixture>('fixtures', { matchId: request.params.id }))[0];
      if (!fixture) return json(200, { fixtureId: null });
      await s.fixtureAccess(fixture.id);
      const appointment = (
        await s.db.find<Appointment>('appointments', {
          fixtureId: fixture.id,
          actorId: request.auth!.actorId,
          status: 'accepted',
        })
      )[0];
      return json(200, { fixtureId: fixture.id, role: appointment?.role ?? 'assistant' });
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/games/:id',
    platformHandler(async (request) =>
      json(200, await service(request).gameContext(request.params.id!)),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/games/:id/access',
    platformHandler(async (request) => {
      const s = service(request);
      await s.fixtureAccess(request.params.id!, true, true);
      const row = (
        await s.db.find<Appointment>('appointments', {
          fixtureId: request.params.id,
          actorId: request.auth!.actorId,
          status: 'accepted',
        })
      )[0];
      return json(200, { fixtureId: request.params.id, role: row.role });
    }),
  );
  router.register(
    'GET',
    '/api/v1/platform/publication/catalog',
    platformHandler(async (request) =>
      json(200, await service(request).publicationCatalog(request.query.cursor)),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/competitions/:id/publication',
    platformHandler(async (request) =>
      json(200, await service(request).publicationPolicy(request.params.id!)),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/competitions/:id/publication/consent',
    platformHandler(async (request) =>
      json(200, await service(request).setPublication(request.params.id!, body(request), true)),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/competitions/:id/publication',
    platformHandler(async (request) =>
      json(200, await service(request).setPublication(request.params.id!, body(request))),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/games/:id/clock',
    platformHandler(async (request) =>
      json(200, await service(request).clock(request.params.id!, body(request))),
    ),
  );
  const publicService = () => new Imports(app, { actorId: 'public', roles: [] });
  const publicResponse = (data: unknown) => ({
    ...json(200, data),
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
  router.register(
    'GET',
    '/api/v1/public/competitions',
    platformHandler(async (request) =>
      publicResponse(
        await publicService().publicCompetitions(request.query.cursor, request.query.sport),
      ),
    ),
  );
  router.register(
    'GET',
    '/api/v1/public/competitions/:id/fixtures',
    platformHandler(async (request) =>
      publicResponse(
        await publicService().publicFixtures(request.params.id!, request.query.cursor),
      ),
    ),
  );
  router.register(
    'GET',
    '/api/v1/public/games/:id',
    platformHandler(async (request) =>
      publicResponse(await publicService().publicFixture(request.params.id!)),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/games/:id/report',
    platformHandler(async (request) =>
      json(200, await service(request).privateReport(request.params.id!)),
    ),
  );
  router.register(
    'GET',
    '/api/v1/platform/games/:id/history',
    platformHandler(async (request) =>
      json(200, await service(request).eventHistory(request.params.id!, request.query.cursor)),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/games/:id/report',
    platformHandler(async (request) =>
      json(200, await service(request).submitGameReport(request.params.id!, body(request))),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/games/:id/homologate',
    platformHandler(async (request) =>
      json(200, await service(request).homologate(request.params.id!)),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/games/:id/periods',
    platformHandler(async (request) =>
      json(200, await service(request).submitPeriod(request.params.id!, body(request))),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/appointments/:id/change',
    platformHandler(async (request) =>
      json(200, await service(request).changeAppointment(request.params.id!, body(request))),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/fixtures/:id/change',
    platformHandler(async (request) =>
      json(200, await service(request).changeFixture(request.params.id!, body(request))),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/memberships/:id/revoke',
    platformHandler(async (request) =>
      json(200, await service(request).revokeMembership(request.params.id!)),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/delegations/:id/revoke',
    platformHandler(async (request) =>
      json(200, await service(request).revokeDelegation(request.params.id!)),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/officials/:id/recover',
    platformHandler(async (request) =>
      json(201, await service(request).recoverOfficial(request.params.id!)),
    ),
  );
  router.register(
    'POST',
    '/api/v1/platform/invitations/:id/revoke',
    platformHandler(async (request) =>
      json(200, await service(request).revokeInvitation(request.params.id!)),
    ),
  );
}
/** Legacy match APIs must also honor revoked delegations and appointments. */
export async function platformMatchAllowed(
  app: ApplicationContainer,
  actorId: string,
  matchId: string,
  principalOnly = false,
) {
  const db = new PlatformStore(app.store);
  const fixtures = await db.find<Fixture>('fixtures', { matchId });
  if (!fixtures.length) return true;
  for (const row of await db.find<Appointment>('appointments', {
    fixtureId: fixtures[0].id,
    actorId,
  }))
    if ((!principalOnly || row.role === 'principal') && (await appointmentValid(db, row, actorId)))
      return true;
  return false;
}
