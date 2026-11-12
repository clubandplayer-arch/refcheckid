import sharp from 'sharp';
import { Profiles } from '../src/platform/profiles.js';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { preparedApp, dataset } from './runtime-fixtures.js';
import { Imports } from '../src/platform/imports.js';
import { createRestApiRouter } from '../src/api/router.js';
import type { AuthContext } from '../src/api/http.js';
import type { Membership, GameEvent } from '../src/platform/types.js';

it('keeps reports federation-private across old/new endpoints and publishes only explicitly authorized match data', async () => {
  const app = await preparedApp(),
    router = createRestApiRouter(app);
  const ownerAuth: AuthContext = {
      actorId: randomUUID(),
      roles: ['federation'],
      federationIds: [dataset.federationSyncPayload.federations[0].id],
    },
    owner = new Imports(app, ownerAuth),
    admin = new Imports(app, { actorId: randomUUID(), roles: ['admin'] });
  const api = (path: string, auth?: AuthContext) => {
    const url = new URL(path, 'https://test.invalid');
    return router.handle({
      method: 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: {},
      ...(auth ? { auth } : {}),
    });
  };
  try {
    const org = await owner.create({
        name: 'Privacy league',
        kind: 'sports',
        federationId: ownerAuth.federationIds![0],
      }),
      scope = { organizationId: org.id, unitId: org.rootUnitId };
    const competition = await owner.createCompetition({
      ...scope,
      name: 'Private cup',
      sport: 'football',
      season: '2026',
      category: 'Under 19',
    });
    const clubs: import('../src/platform/catalog.js').ClubRecord[] = [],
      teams = [];
    for (const code of ['H', 'A']) {
      const club = await owner.createClub({ ...scope, code, name: code });
      clubs.push(club);
      const team = await owner.createTeam({
        ...scope,
        code,
        name: code,
        clubId: club.clubId,
        sport: 'football',
        season: '2026',
        category: 'Under 19',
      });
      teams.push(team);
      await owner.createEntry({ competitionId: competition.id, teamId: team.id });
    }
    await new Profiles(app,ownerAuth).save('club',clubs[0].clubId,{revision:0,imageBase64:'data:image/png;base64,'+(await sharp({create:{width:20,height:20,channels:4,background:'#123456'}}).png().toBuffer()).toString('base64')});
    const fixture = await owner.createFixture({
      competitionId: competition.id,
      code: 'PRIVATE',
      homeTeamId: teams[0].id,
      awayTeamId: teams[1].id,
      scheduledAt: '2026-12-12T15:00:00Z',
      venue: 'Test',
      round: '1',
    });
    const arbitration = await new Imports(app,{...ownerAuth,roles:['admin']}).create({ name: 'Referee association', kind: 'refereeing' }),
      arbScope = { organizationId: arbitration.id, unitId: arbitration.rootUnitId };
    await owner.createDelegation({
      competitionId: competition.id,
      recipientOrganizationId: arbitration.id,
      recipientUnitId: arbitration.rootUnitId,
      designate: true,
      expiresAt: '2099-01-01T00:00:00Z',
    });
    const delegateAuth: AuthContext = {
      actorId: randomUUID(),
      roles: ['federation'],
      federationIds: [],
    };
    await owner.db.put<Membership>('memberships', {
      ...arbScope,
      actorId: delegateAuth.actorId,
      role: 'designator',
      active: true,
      descendants: true,
    });
    const delegate = new Imports(app, delegateAuth);
    const officials = [];
    for (const role of ['principal', 'assistant'] as const) {
      const actorId = randomUUID(),
        official = await owner.createOfficial({
          ...arbScope,
          code: role,
          firstName: 'Test',
          lastName: role,
          sports: 'football',
        });
      await owner.db.update('officials', official.id, { ...official, actorId });
      await owner.db.put<Membership>('memberships', {
        ...arbScope,
        actorId,
        refereeId: official.refereeId,
        role: 'referee',
        active: true,
        descendants: false,
      });
      const auth: AuthContext = { actorId, roles: ['referee'], refereeIds: [official.refereeId] };
      const referee = new Imports(app, auth);
      const appointment = await owner.createAppointment({
        fixtureId: fixture.id,
        officialId: official.id,
        role,
        send: true,
      });
      await referee.changeAppointment(appointment.id, { action: 'accept' });
      officials.push({ referee, auth });
    }
    const scopedReader: AuthContext = {
        actorId: randomUUID(),
        roles: ['federation'],
        federationIds: [],
      },
      scopedManager: AuthContext = {
        actorId: randomUUID(),
        roles: ['federation'],
        federationIds: [],
      };
    await owner.db.put<Membership>('memberships', {
      ...scope,
      actorId: scopedReader.actorId,
      role: 'viewer',
      active: true,
      descendants: true,
    });
    await owner.db.put<Membership>('memberships', {
      ...scope,
      actorId: scopedManager.actorId,
      role: 'competition_manager',
      active: true,
      descendants: true,
    });
    const principal = officials[0],
      assistant = officials[1];
    const player = await app.repositories.players.create({
        federationId: org.federationId!,
        firstName: 'SecretFirst',
        lastName: 'SecretLast',
        birthDate: '2008-02-03',
        birthPlace: null,
        fiscalCode: 'SECRET-FISCAL',
        status: 'active',
      }),
      registration = await app.repositories.registrations.create({
        playerId: player.id,
        clubId: clubs[0].clubId,
        season: '2026',
        registrationNumber: 'SECRET-REG',
        status: 'active',
        registeredAt: new Date().toISOString(),
      });
    const sheet = (await app.repositories.matchSheets.listByMatch(fixture.matchId)).find(
      (row) => row.clubId === clubs[0].clubId,
    )!;
    await app.repositories.matchSheetPlayers.replaceByMatchSheet(sheet.id, [
      {
        matchSheetId: sheet.id,
        playerRegistrationId: registration.id,
        shirtNumber: 9,
        role: 'starter',
        lineupOrder: 0,
        isGoalkeeper: false,
        isCaptain: true,
        isViceCaptain: false,
        status: 'listed',
      },
    ]);
    await app.repositories.recognitions.updateWorkflowStatus(fixture.matchId, 'locked');
    const event: GameEvent = {
      id: randomUUID(),
      period: 1,
      type: 'goal',
      clubId: clubs[0].clubId,
      registrationId: registration.id,
      incomingRegistrationId: null,
      minute: 3,
      stoppage: 0,
      points: 1,
    };
    expect((await api(`/api/v1/public/games/${fixture.id}`)).status).toBe(404);
    expect((await api(`/api/v1/public/games/${fixture.id}/logos/home`)).status).toBe(404);
    expect((await api('/api/v1/public/competitions')).body).toMatchObject({ total: 0 });
    await expect(
      delegate.setPublication(
        competition.id,
        { revision: 0, consent: true, consentEvents: true, consentNames: true },
        true,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      admin.setPublication(competition.id, {
        revision: 0,
        mode: 'public',
        includeLive: true,
        includeEvents: true,
        includeNames: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await owner.setPublication(
      competition.id,
      { revision: 0, consent: true, consentEvents: true, consentNames: false },
      true,
    );
    await expect(
      owner.setPublication(competition.id, {
        revision: 1,
        mode: 'public',
        includeLive: true,
        includeEvents: true,
        includeNames: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await admin.setPublication(competition.id, {
      revision: 1,
      mode: 'public',
      includeLive: true,
      includeEvents: true,
      includeNames: false,
    });
    const start = { operationId: randomUUID(), revision: 0, action: 'start' };
    expect((await principal.referee.clock(fixture.id, start))?.revision).toBe(1);
    expect((await principal.referee.clock(fixture.id, start))?.revision).toBe(1);
    await expect(
      assistant.referee.clock(fixture.id, { ...start, operationId: randomUUID() }),
    ).rejects.toMatchObject({ status: 403 });
    const body = {
      operationId: randomUUID(),
      revision: 0,
      period: 1,
      state: 'provisional',
      homeScore: 1,
      awayScore: 0,
      events: [event],
    };
    await expect(delegate.submitPeriod(fixture.id, body)).rejects.toMatchObject({ status: 403 });
    await principal.referee.submitPeriod(fixture.id, body);
    const live = await api(`/api/v1/public/games/${fixture.id}`);
    expect(live.status).toBe(200);
    expect(live.body).toMatchObject({
      phase: 'live',
      certification: 'provisional',
      score: { home: 1, away: 0 },
      events: [{ participant: {}, incoming: {} }],
    });
    await admin.setPublication(competition.id, {
      revision: 2,
      mode: 'public',
      includeLive: false,
      includeEvents: true,
      includeNames: false,
    });
    expect((await api(`/api/v1/public/games/${fixture.id}`)).body).toMatchObject({
      score: null,
      certification: 'awaiting',
      events: [],
    });
    await principal.referee.submitPeriod(fixture.id, {
      ...body,
      operationId: randomUUID(),
      revision: 1,
      state: 'period_confirmed',
    });
    const extra = { ...event, id: randomUUID(), period: 2 };
    await principal.referee.submitPeriod(fixture.id, {
      ...body,
      operationId: randomUUID(),
      revision: 2,
      period: 2,
      events: [event, extra],
      homeScore: 2,
    });
    expect((await api(`/api/v1/public/games/${fixture.id}`)).body).toMatchObject({
      score: { home: 1, away: 0 },
      certification: 'referee_confirmed',
      period: 1,
    });
    await principal.referee.submitPeriod(fixture.id, {
      ...body,
      operationId: randomUUID(),
      revision: 3,
      period: 2,
      events: [event, extra],
      homeScore: 2,
      state: 'final_confirmed',
    });
    const logo=await api(`/api/v1/public/games/${fixture.id}/logos/home`);expect(logo.status).toBe(200);expect(logo.headers?.['content-type']).toBe('image/webp');
    const secret = 'REPORT-PRIVATE-NEVER-IN-RESULTS';
    const report = await principal.referee.submitGameReport(fixture.id, { notes: secret });
    for (const auth of [
      delegateAuth,
      admin.auth,
      scopedReader,
      assistant.auth,
      { actorId: randomUUID(), roles: ['manager'], clubIds: [clubs[0].clubId] },
    ]) {
      for (const path of [
        `/api/v1/platform/games/${fixture.id}/report`,
        `/api/v1/match-reports/${report.id}`,
        `/api/v1/match-reports?matchId=${fixture.matchId}`,
        `/api/v1/audit/by-match?matchId=${fixture.matchId}`,
      ])
        expect((await api(path, auth)).status, path).toBe(403);
    }
    expect((await api(`/api/v1/platform/games/${fixture.id}/report`, ownerAuth)).status).toBe(200);
    expect((await api(`/api/v1/platform/games/${fixture.id}/report`, principal.auth)).status).toBe(
      200,
    );
    expect((await api(`/api/v1/platform/games/${fixture.id}/report`, scopedManager)).status).toBe(
      200,
    );
    expect((await api(`/api/v1/platform/games/${fixture.id}/report`)).status).toBe(401);
    expect(
      (await api(`/api/v1/platform/games/${fixture.id}/history`, scopedReader)).body,
    ).toMatchObject({
      items: [{ revision: 4 }, { revision: 3 }, { revision: 2 }, { revision: 1 }],
    });
    const delegatedGame = await api(`/api/v1/platform/games/${fixture.id}`, delegateAuth);
    expect(delegatedGame.status).toBe(200);
    expect(delegatedGame.body).not.toHaveProperty('report');
    expect(JSON.stringify(delegatedGame.body)).not.toContain(secret);
    const published = await api(`/api/v1/public/games/${fixture.id}`),
      encoded = JSON.stringify(published.body);
    for (const forbidden of [
      secret,
      registration.id,
      player.id,
      principal.auth.actorId,
      '2008-02-03',
      'SECRET-FISCAL',
      'SecretFirst',
    ])
      expect(encoded).not.toContain(forbidden);
    expect(published.headers?.['cache-control']).toBe('no-store');
    expect(published.body).toMatchObject({ phase: 'finished', certification: 'referee_confirmed' });
    await expect(
      admin.setPublication(competition.id, {
        revision: (await owner.publicationPolicy(competition.id)).revision,
        mode: 'public',
        includeLive: true,
        includeEvents: true,
        includeNames: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await owner.setPublication(
      competition.id,
      {
        revision: (await owner.publicationPolicy(competition.id)).revision,
        consent: true,
        consentEvents: true,
        consentNames: true,
      },
      true,
    );
    await admin.setPublication(competition.id, {
      revision: (await owner.publicationPolicy(competition.id)).revision,
      mode: 'public',
      includeLive: true,
      includeEvents: true,
      includeNames: true,
    });
    expect(JSON.stringify((await api(`/api/v1/public/games/${fixture.id}`)).body)).toContain(
      'SecretFirst',
    );
    await expect(admin.homologate(fixture.id)).rejects.toMatchObject({status:403});
    await owner.homologate(fixture.id);
    expect((await api(`/api/v1/public/games/${fixture.id}`)).body).toMatchObject({
      certification: 'homologated',
    });
    for(const auth of [undefined,delegateAuth,admin.auth])for(const route of router.listRoutes().filter(row=>row.method==='GET')){
      const path=route.path.replace(/:[a-zA-Z]+/g,parameter=>parameter===':kind'?'clubs':route.path.includes('match-reports')?report.id:route.path.includes('/competitions/')?competition.id:route.path.includes('/matches/')||route.path.includes('match-game')||route.path.includes('match-roster')?fixture.matchId:fixture.id);
      const response=await router.handle({method:'GET',path,headers:{},query:{matchId:fixture.matchId,competitionId:competition.id,organizationId:arbitration.id,unitId:arbitration.rootUnitId,clubId:clubs[0].clubId,action:'POST /api/v1/match-reports'},...(auth?{auth}:{})});
      expect(JSON.stringify(response.body),`${auth?.roles.join(',')??'anonymous'} ${path}`).not.toContain(secret);
    }
    await owner.setPublication(
      competition.id,
      {
        revision: (await owner.publicationPolicy(competition.id)).revision,
        consent: false,
        consentEvents: false,
        consentNames: false,
      },
      true,
    );
    expect((await api(`/api/v1/public/games/${fixture.id}`)).status).toBe(404);
    expect((await api(`/api/v1/public/games/${fixture.id}/logos/home`)).status).toBe(404);
    expect((await api(`/api/v1/public/competitions/${competition.id}/fixtures`)).status).toBe(404);
    expect((await api('/api/v1/public/competitions')).body).toMatchObject({ total: 0 });
  } finally {
    await app.store.close();
  }
});
