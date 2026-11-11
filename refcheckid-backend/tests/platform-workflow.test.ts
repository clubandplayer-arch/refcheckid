import { randomUUID, createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { preparedApp, dataset } from './runtime-fixtures.js';
import { createRestApiRouter } from '../src/api/router.js';
import type { AuthContext } from '../src/api/http.js';
import type {
  Membership,
  Organization,
  Unit,
  Competition,
  Fixture,
  Official,
  Invitation,
  Appointment,
  ImportJob,
  Team,
  GameSummary,
} from '../src/platform/types.js';
import { PlatformStore } from '../src/platform/store.js';
import { Imports } from '../src/platform/imports.js';
import { parseSpreadsheet } from '../src/platform/import-files.js';

it('isolates territorial organizations, activates a referee by code, designates a delegated game, confirms periods and honors revocation on legacy APIs', async () => {
  const app = await preparedApp();
  const router = createRestApiRouter(app);
  const db = new PlatformStore(app.store);
  const auth: AuthContext = {
    actorId: randomUUID(),
    roles: ['federation'],
    federationIds: [dataset.federationSyncPayload.federations[0].id],
  };
  const call = (
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    as: AuthContext | undefined = auth,
    query: Record<string, string> = {},
  ) =>
    router.handle({
      method,
      path: `/api/v1/${path}`,
      headers: {},
      query,
      ...(body ? { body } : {}),
      ...(as ? { auth: as } : {}),
    });
  async function post<T>(path: string, body: unknown, as = auth) {
    const response = await call('POST', `platform/${path}`, body, as);
    expect(response.status, JSON.stringify(response.body)).toBeLessThan(300);
    return response.body as T;
  }
  try {
    expect(
      (
        await call('POST', 'platform/organizations', {
          name: 'Wrong linked refereeing organization',
          kind: 'refereeing',
          federationId: auth.federationIds![0],
        })
      ).status,
    ).toBe(400);
    expect(await db.get('organizations', auth.federationIds![0])).toBeNull();
    const sport = await post<Organization>('organizations', {
      name: 'Lega test',
      kind: 'sports',
      federationId: auth.federationIds![0],
    });
    const region = await post<Unit>('units', {
      organizationId: sport.id,
      parentId: sport.rootUnitId,
      name: 'Sicilia',
      kind: 'regional',
    });
    const province = await post<Unit>('units', {
      organizationId: sport.id,
      parentId: region.id,
      name: 'Siracusa',
      kind: 'provincial',
    });
    const arbitration = await post<Organization>('organizations', {
      name: 'Organizzazione arbitrale test',
      kind: 'refereeing',
    });
    const section = await post<Unit>('units', {
      organizationId: arbitration.id,
      parentId: arbitration.rootUnitId,
      name: 'Sezione Siracusa',
      kind: 'section',
    });
    const competitor = { actorId: randomUUID(), roles: ['federation'], federationIds: [] };
    await db.put<Membership>('memberships', {
      organizationId: arbitration.id,
      unitId: section.id,
      actorId: competitor.actorId,
      role: 'designator',
      active: true,
      descendants: false,
    });
    const competition = await post<Competition>('competitions', {
      organizationId: sport.id,
      unitId: province.id,
      name: 'Provinciale',
      sport: 'football',
      season: '2026/2027',
      category: 'Under 19',
      group: 'A',
    });
    expect(
      (
        await call('GET', 'platform/fixtures', undefined, competitor, {
          competitionId: competition.id,
        })
      ).status,
    ).toBe(403);
    const grant = await post<{ id: string }>('delegations', {
      competitionId: competition.id,
      recipientOrganizationId: arbitration.id,
      recipientUnitId: section.id,
      designate: true,
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    expect(
      (
        await call('GET', 'platform/fixtures', undefined, competitor, {
          competitionId: competition.id,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          'platform/competitions',
          {
            organizationId: sport.id,
            unitId: province.id,
            name: 'Forbidden',
            sport: 'football',
            season: '2026',
            category: 'X',
          },
          competitor,
        )
      ).status,
    ).toBe(403);
    const club1 = await post<{ clubId: string }>('clubs', {
      organizationId: sport.id,
      unitId: province.id,
      code: 'HOME',
      name: 'Casa',
    });
    const club2 = await post<{ clubId: string }>('clubs', {
      organizationId: sport.id,
      unitId: province.id,
      code: 'AWAY',
      name: 'Ospite',
    });
    const teams: Team[] = [];
    for (const [index, club] of [club1, club2].entries())
      teams.push(
        await post<Team>('teams', {
          organizationId: sport.id,
          unitId: province.id,
          code: `TEAM${index}`,
          name: `Squadra ${index}`,
          clubId: club.clubId,
          sport: 'football',
          season: '2026/2027',
          category: 'Under 19',
        }),
      );
    for (const team of teams)
      await post('entries', { competitionId: competition.id, teamId: team.id });
    expect(
      (await call('GET', `platform/competitions/${competition.id}/eligible-teams`, undefined, auth))
        .status,
    ).toBe(200);
    expect(
      (
        await call(
          'GET',
          `platform/competitions/${competition.id}/eligible-teams`,
          undefined,
          competitor,
        )
      ).status,
    ).toBe(403);
    expect(
      (await call('GET', `platform/competitions/${competition.id}/entries`, undefined, competitor))
        .body,
    ).toMatchObject({ total: 2 });
    const fixture = await post<Fixture>('fixtures', {
      competitionId: competition.id,
      code: 'G001',
      homeTeamId: teams[0].id,
      awayTeamId: teams[1].id,
      round: '1',
      scheduledAt: '2026-12-10T15:00:00+01:00',
      venue: 'Campo test',
    });
    const official = await post<Official>(
      'officials',
      {
        organizationId: arbitration.id,
        unitId: section.id,
        code: 'REF001',
        firstName: 'Mario',
        lastName: 'Test',
        sports: 'football',
      },
      competitor,
    );
    const unrelatedSection = await post<Unit>('units', {
      organizationId: arbitration.id,
      parentId: arbitration.rootUnitId,
      name: 'Sezione non delegata',
      kind: 'section',
    });
    await db.put<Membership>('memberships', {
      organizationId: arbitration.id,
      unitId: unrelatedSection.id,
      actorId: competitor.actorId,
      role: 'designator',
      active: true,
      descendants: false,
    });
    const unrelatedOfficial = await post<Official>('officials', {
      organizationId: arbitration.id,
      unitId: unrelatedSection.id,
      code: 'OUTSIDE',
      firstName: 'Outside',
      lastName: 'Official',
      sports: 'football',
    });
    expect(
      (
        await call(
          'POST',
          'platform/appointments',
          { fixtureId: fixture.id, officialId: unrelatedOfficial.id, role: 'assistant' },
          competitor,
        )
      ).status,
    ).toBe(403);
    const invitation = await post<{ code: string; token: string; id: string }>(
      'invitations',
      {
        organizationId: arbitration.id,
        unitId: section.id,
        role: 'referee',
        officialId: official.id,
        displayName: 'Mario Test',
      },
      competitor,
    );
    const activated = await call(
      'POST',
      'platform/activate',
      { token: invitation.token, password: 'Long-test-password-123!' },
      undefined,
    );
    expect(activated.status, JSON.stringify(activated.body)).toBe(200);
    expect(JSON.stringify(await db.get<Invitation>('invitations', invitation.id))).not.toContain(
      invitation.token,
    );
    expect(
      (
        await call(
          'POST',
          'platform/activate',
          { token: invitation.token, password: 'Long-test-password-123!' },
          undefined,
        )
      ).status,
    ).toBe(400);
    const login = await call(
      'POST',
      'auth/login',
      { email: invitation.code, password: 'Long-test-password-123!' },
      undefined,
    );
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    const session = login.body as { accessToken: string; user: { id: string } };
    const headers = { authorization: `Bearer ${session.accessToken}` };
    const appointment = await post<Appointment>(
      'appointments',
      { fixtureId: fixture.id, officialId: official.id, role: 'principal', send: true },
      competitor,
    );
    const accept = await router.handle({
      method: 'POST',
      path: `/api/v1/platform/appointments/${appointment.id}/change`,
      headers,
      query: {},
      body: { action: 'accept' },
    });
    expect(accept.status, JSON.stringify(accept.body)).toBe(200);
    expect(
      (
        await router.handle({
          method: 'GET',
          path: `/api/v1/matches/${fixture.matchId}`,
          headers,
          query: {},
        })
      ).status,
    ).toBe(200);
    const recovery = await post<{ token: string }>(`officials/${official.id}/recover`, {});
    expect(
      (
        await call(
          'POST',
          'platform/activate',
          { token: recovery.token, password: 'Replacement-test-password-456!' },
          undefined,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await router.handle({
          method: 'GET',
          path: `/api/v1/platform/my-appointments`,
          headers,
          query: {},
        })
      ).status,
    ).toBe(401);
    const renewed = await call(
      'POST',
      'auth/login',
      { email: invitation.code, password: 'Replacement-test-password-456!' },
      undefined,
    );
    expect(renewed.status).toBe(200);
    headers.authorization = `Bearer ${(renewed.body as { accessToken: string }).accessToken}`;
    const player = await app.repositories.players.create({
      federationId: sport.federationId!,
      firstName: 'Goal',
      lastName: 'Scorer',
      birthDate: '2006-01-01',
      birthPlace: null,
      fiscalCode: null,
      status: 'active',
    });
    const registration = await app.repositories.registrations.create({
      playerId: player.id,
      clubId: club1.clubId,
      season: '2026/2027',
      registrationNumber: 'SCORER',
      status: 'active',
      registeredAt: new Date().toISOString(),
    });
    const sheet = (await app.repositories.matchSheets.listByMatch(fixture.matchId)).find(
      (row) => row.clubId === club1.clubId,
    )!;
    await app.repositories.matchSheetPlayers.replaceByMatchSheet(sheet.id, [
      {
        matchSheetId: sheet.id,
        playerRegistrationId: registration.id,
        shirtNumber: 9,
        role: 'starter',
        lineupOrder: 0,
        isGoalkeeper: false,
        isCaptain: false,
        isViceCaptain: false,
        status: 'listed',
      },
    ]);
    const draft = {
      players: [
        { playerRegistrationId: registration.id, shirtNumber: 9, role: 'starter' as const },
      ],
      staff: [],
    };
    await expect(app.services.matchSheets.saveDraft(sheet.id, draft)).rejects.toThrow(
      'assegnati alla squadra',
    );
    const personRecord = await db.put<import('../src/platform/types.js').PersonRecord>('people', {
      organizationId: sport.id,
      unitId: province.id,
      kind: 'player',
      code: 'SCORER',
      firstName: 'Goal',
      lastName: 'Scorer',
      birthDate: '2006-01-01',
      clubId: club1.clubId,
      season: '2026/2027',
      registrationId: registration.id,
      personId: player.id,
      status: 'active',
    });
    await post('squad-members', { personRecordId: personRecord.id, teamId: teams[0].id });
    await expect(app.services.matchSheets.saveDraft(sheet.id, draft)).resolves.toHaveProperty(
      'id',
      sheet.id,
    );
    await app.repositories.recognitions.updateWorkflowStatus(fixture.matchId, 'locked');
    const period = {
      operationId: randomUUID(),
      revision: 0,
      period: 1,
      homeScore: 1,
      awayScore: 0,
      events: [
        {
          id: randomUUID(),
          type: 'goal',
          clubId: club1.clubId,
          registrationId: registration.id,
          incomingRegistrationId: null,
          minute: 10,
          stoppage: 0,
          points: 1,
          period: 1,
        },
      ],
      state: 'period_confirmed',
    };
    const update = await router.handle({
      method: 'POST',
      path: `/api/v1/platform/games/${fixture.id}/periods`,
      headers,
      query: {},
      body: period,
    });
    expect(update.status, JSON.stringify(update.body)).toBe(200);
    expect((update.body as GameSummary).revision).toBe(1);
    const retry = await router.handle({
      method: 'POST',
      path: `/api/v1/platform/games/${fixture.id}/periods`,
      headers,
      query: {},
      body: period,
    });
    expect(retry.status).toBe(200);
    expect(
      (
        await router.handle({
          method: 'POST',
          path: `/api/v1/platform/games/${fixture.id}/periods`,
          headers,
          query: {},
          body: { ...period, operationId: randomUUID(), period: 2, state: 'final_confirmed' },
        })
      ).status,
    ).toBe(409);
    const tampered = await router.handle({
      method: 'POST',
      path: `/api/v1/platform/games/${fixture.id}/periods`,
      headers,
      query: {},
      body: {
        ...period,
        revision: 1,
        operationId: randomUUID(),
        period: 2,
        state: 'final_confirmed',
        homeScore: 0,
        events: [],
      },
    });
    expect(tampered.status).toBe(400);
    const final = await router.handle({
      method: 'POST',
      path: `/api/v1/platform/games/${fixture.id}/periods`,
      headers,
      query: {},
      body: {
        ...period,
        revision: 1,
        operationId: randomUUID(),
        period: 2,
        state: 'final_confirmed',
      },
    });
    expect(final.status, JSON.stringify(final.body)).toBe(200);
    const report = await router.handle({
      method: 'POST',
      path: `/api/v1/platform/games/${fixture.id}/report`,
      headers,
      query: {},
      body: { notes: 'Test complete report' },
    });
    expect(report.status, JSON.stringify(report.body)).toBe(200);
    const homologated = await post<GameSummary>(`games/${fixture.id}/homologate`, {});
    expect(homologated.homologatedAt).toBeTruthy();
    await post(`delegations/${grant.id}/revoke`, {});
    expect(
      (
        await router.handle({
          method: 'GET',
          path: `/api/v1/matches/${fixture.matchId}`,
          headers,
          query: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await router.handle({
          method: 'GET',
          path: `/api/v1/platform/games/${fixture.id}`,
          headers,
          query: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('GET', 'platform/fixtures', undefined, competitor, {
          competitionId: competition.id,
        })
      ).status,
    ).toBe(403);
  } finally {
    await app.store.close();
  }
});

it.each([205, 10000])(
  'imports and resumes %i CSV rows, rejects duplicates, preserves club identity across seasons and does not notify on previews',
  async (count) => {
    const app = await preparedApp();
    const router = createRestApiRouter(app);
    const db = new PlatformStore(app.store);
    const auth: AuthContext = {
      actorId: randomUUID(),
      roles: ['federation'],
      federationIds: [dataset.federationSyncPayload.federations[0].id],
    };
    const call = (path: string, body: unknown) =>
      router.handle({
        method: 'POST',
        path: `/api/v1/platform/${path}`,
        headers: {},
        query: {},
        body,
        auth,
      });
    try {
      const response = await call('organizations', {
        name: 'Import test',
        kind: 'sports',
        federationId: auth.federationIds![0],
      });
      expect(response.status).toBe(201);
      const org = response.body as Organization;
      const scope = { organizationId: org.id, unitId: org.rootUnitId, kind: 'clubs' };
      const content = [
        'code;name',
        ...Array.from({ length: count }, (_, i) => `C${i};Società ${i}`),
      ].join('\n');
      const bytes = Buffer.from(content);
      const upload = await call('imports/upload', {
        ...scope,
        filename: 'clubs.csv',
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      expect(upload.status).toBe(201);
      const prepared = await call('imports/prepare', {
        uploadId: (upload.body as { id: string }).id,
        contentBase64: bytes.toString('base64'),
      });
      expect(prepared.status, JSON.stringify(prepared.body)).toBe(201);
      let job = prepared.body as ImportJob;
      for (let i = 0; i < Math.ceil(count / 100); i++) {
        const step = await call(`imports/${job.id}/advance`, { action: 'advance' });
        expect(step.status, JSON.stringify(step.body)).toBe(200);
        job = step.body as ImportJob;
      }
      expect(job.status).toBe('preview');
      expect(job.errors).toBe(0);
      expect(await db.find('clubs', { organizationId: org.id })).toHaveLength(0);
      expect(await db.find('notifications', {})).toHaveLength(0);
      expect((await call(`imports/${job.id}/advance`, { action: 'commit' })).status).toBe(200);
      for (let i = 0; i < Math.ceil(count / 100); i++)
        job = (await call(`imports/${job.id}/advance`, { action: 'advance' })).body as ImportJob;
      expect(job.status).toBe('completed');
      expect(job.processed).toBe(count);
      expect(await db.find('clubs', { organizationId: org.id })).toHaveLength(count);
      await call(`imports/${job.id}/advance`, { action: 'advance' });
      expect(await db.find('clubs', { organizationId: org.id })).toHaveLength(count);
      const first = (await call('clubs', { ...scope, code: 'C1', name: 'Società aggiornata' }))
        .body as { clubId: string };
      const again = (
        await call('clubs', {
          ...scope,
          code: 'C1',
          name: 'Società aggiornata',
          season: '2027/2028',
        })
      ).body as { clubId: string };
      expect(first.clubId).toBe(again.clubId);
      const bad = Buffer.from('code;name\nDUP;Uno\nDUP;Due');
      const up = await call('imports/upload', {
        ...scope,
        filename: 'bad.csv',
        size: bad.length,
        sha256: createHash('sha256').update(bad).digest('hex'),
      });
      const prep = await call('imports/prepare', {
        uploadId: (up.body as { id: string }).id,
        contentBase64: bad.toString('base64'),
      });
      const invalid = (
        await call(`imports/${(prep.body as ImportJob).id}/advance`, { action: 'advance' })
      ).body as ImportJob;
      expect(invalid.errors).toBe(1);
      expect((await call(`imports/${invalid.id}/advance`, { action: 'commit' })).status).toBe(409);
    } finally {
      await app.store.close();
    }
  },
  60000,
);

it('reads XLSX values, rejects formulas and malformed CSV', async () => {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  const sheet = wb.addWorksheet('Dati');
  sheet.addRow(['code', 'name']);
  sheet.addRow(['C1', 'Società']);
  expect(await parseSpreadsheet(Buffer.from(await wb.xlsx.writeBuffer()), 'clubs.xlsx')).toEqual([
    { code: 'C1', name: 'Società' },
  ]);
  sheet.getCell('B2').value = { formula: '1+1', result: 2 };
  await expect(
    parseSpreadsheet(Buffer.from(await wb.xlsx.writeBuffer()), 'clubs.xlsx'),
  ).rejects.toThrow('formule');
  await expect(parseSpreadsheet(Buffer.from('code,name\n"unclosed'), 'bad.csv')).rejects.toThrow(
    'Virgolette',
  );
});

it('links historical player and staff registrations without replacing their IDs or photo associations', async () => {
  const app = await preparedApp(),
    router = createRestApiRouter(app);
  const auth: AuthContext = {
    actorId: randomUUID(),
    roles: ['federation'],
    federationIds: [dataset.federationSyncPayload.federations[0].id],
  };
  const post = async (path: string, body: unknown) => {
    const response = await router.handle({
      method: 'POST',
      path: `/api/v1/platform/${path}`,
      headers: {},
      query: {},
      body,
      auth,
    });
    expect(response.status, JSON.stringify(response.body)).toBeLessThan(300);
    return response.body as Record<string, unknown> & { id: string };
  };
  try {
    const org = await post('organizations', {
      name: 'Historical identity',
      kind: 'sports',
      federationId: auth.federationIds![0],
    });
    const scope = { organizationId: org.id, unitId: org.rootUnitId };
    const club = (await app.repositories.clubs.list())[0];
    await post('clubs', { ...scope, code: 'OLD', name: club.name, existingClubId: club.id });
    const playerRegistration = (await app.repositories.registrations.listByClub(club.id))[0],
      player = (await app.repositories.players.findById(playerRegistration.playerId))!;
    const staffRegistration = (
        await app.repositories.registrations.listStaffRegistrationsByClub(club.id)
      )[0],
      staff = (await app.repositories.registrations.findStaffMemberById(
        staffRegistration.staffMemberId,
      ))!;
    const beforePlayerCount = (await app.repositories.registrations.list()).length,
      beforeStaffCount = (
        await app.repositories.registrations.listStaffRegistrationsByClub(club.id)
      ).length;
    for (const [kind, content] of [
      [
        'players',
        `code;first_name;last_name;birth_date;club_code;season;existing_person_id\nOLD-P;${player.firstName};${player.lastName};${player.birthDate};OLD;${playerRegistration.season};${player.id}`,
      ],
      [
        'staff',
        `code;first_name;last_name;club_code;season;role;existing_person_id\nOLD-S;${staff.firstName};${staff.lastName};OLD;${staffRegistration.season};${staffRegistration.role};${staff.id}`,
      ],
    ]) {
      const bytes = Buffer.from(content),
        upload = await post('imports/upload', {
          ...scope,
          kind,
          filename: `${kind}.csv`,
          size: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      let job = await post('imports/prepare', {
        uploadId: upload.id,
        contentBase64: bytes.toString('base64'),
      });
      job = await post(`imports/${job.id}/advance`, { action: 'advance' });
      expect(job.errors).toBe(0);
      await post(`imports/${job.id}/advance`, { action: 'commit' });
      await post(`imports/${job.id}/advance`, { action: 'advance' });
    }
    expect((await app.repositories.registrations.list()).length).toBe(beforePlayerCount);
    expect(
      (await app.repositories.registrations.listStaffRegistrationsByClub(club.id)).length,
    ).toBe(beforeStaffCount);
    const people = await new PlatformStore(app.store).find<
      import('../src/platform/types.js').PersonRecord
    >('people', { organizationId: org.id });
    expect(people.map((person) => person.registrationId)).toEqual(
      expect.arrayContaining([playerRegistration.id, staffRegistration.id]),
    );
  } finally {
    await app.store.close();
  }
});

it('imports 10,000 players in resumable blocks and pages the resulting registry', async () => {
  const app = await preparedApp(),
    router = createRestApiRouter(app);
  const auth: AuthContext = {
    actorId: randomUUID(),
    roles: ['federation'],
    federationIds: [dataset.federationSyncPayload.federations[0].id],
  };
  const post = async (path: string, body: unknown) => {
    const response = await router.handle({
      method: 'POST',
      path: `/api/v1/platform/${path}`,
      headers: {},
      query: {},
      body,
      auth,
    });
    expect(response.status, JSON.stringify(response.body)).toBeLessThan(300);
    return response.body as Record<string, unknown> & { id: string };
  };
  try {
    const org = await post('organizations', {
        name: 'Large roster',
        kind: 'sports',
        federationId: auth.federationIds![0],
      }),
      scope = { organizationId: String(org.id), unitId: String(org.rootUnitId) };
    await post('clubs', { ...scope, code: 'LARGE', name: 'Società campione' });
    const bytes = Buffer.from(
      [
        'code;first_name;last_name;birth_date;club_code;season',
        ...Array.from(
          { length: 10000 },
          (_, i) => `P${i};Nome ${i};Cognome;2005-01-01;LARGE;2026/2027`,
        ),
      ].join('\n'),
    );
    const upload = await post('imports/upload', {
      ...scope,
      kind: 'players',
      filename: '10000-players.csv',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    let job = await post('imports/prepare', {
      uploadId: upload.id,
      contentBase64: bytes.toString('base64'),
    });
    for (let n = 0; n < 100; n++)
      job = await post(`imports/${job.id}/advance`, { action: 'advance' });
    expect(job.errors).toBe(0);
    expect(job.status).toBe('preview');
    await post(`imports/${job.id}/advance`, { action: 'commit' });
    for (let n = 0; n < 100; n++)
      job = await post(`imports/${job.id}/advance`, { action: 'advance' });
    expect(job.processed).toBe(10000);
    const page = await router.handle({
      method: 'GET',
      path: '/api/v1/platform/entities/people',
      headers: {},
      query: scope,
      auth,
    });
    expect(page.status).toBe(200);
    expect((page.body as { total: number }).total).toBe(10000);
    expect(typeof (page.body as { nextCursor: unknown }).nextCursor).toBe('string');
    expect((page.body as { items: unknown[] }).items).toHaveLength(50);
    await post(`imports/${job.id}/advance`, { action: 'advance' });
    expect(
      await new PlatformStore(app.store).find('people', { organizationId: org.id }),
    ).toHaveLength(10000);
  } finally {
    await app.store.close();
  }
}, 60000);

it('rechecks revoked import permissions after reading a private chunk and before committing it', async () => {
  const app = await preparedApp();
  const root = new Imports(app, {
    actorId: randomUUID(),
    roles: ['federation'],
    federationIds: [dataset.federationSyncPayload.federations[0].id],
  });
  try {
    const org = await app.store.transaction(() =>
      root.create({
        name: 'Permission boundary',
        kind: 'sports',
        federationId: dataset.federationSyncPayload.federations[0].id,
      }),
    );
    const actorId = randomUUID(),
      db = new PlatformStore(app.store);
    const membership = await db.put<Membership>('memberships', {
      organizationId: org.id,
      unitId: org.rootUnitId,
      actorId,
      role: 'registrar',
      active: true,
      descendants: false,
    });
    const registrar = new Imports(app, { actorId, roles: ['federation'], federationIds: [] });
    const bytes = Buffer.from('code;name\nSAFE;Scoped club');
    const upload = await registrar.upload({
      organizationId: org.id,
      unitId: org.rootUnitId,
      kind: 'clubs',
      filename: 'clubs.csv',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    const job = (await registrar.prepare({
      uploadId: upload.id,
      contentBase64: bytes.toString('base64'),
    })) as ImportJob;
    const original = app.objectStores.photos.readObject.bind(app.objectStores.photos);
    const spy = vi
      .spyOn(app.objectStores.photos, 'readObject')
      .mockImplementationOnce(async (key) => {
        const result = await original(key);
        await app.store.transaction(() =>
          db.update<Membership>('memberships', membership.id, { active: false }),
        );
        return result;
      });
    await expect(registrar.runAdvance(job.id, 'advance')).rejects.toMatchObject({ status: 403 });
    spy.mockRestore();
    expect(await db.get<ImportJob>('imports', job.id)).toHaveProperty('validated', 0);
    expect(await db.find('import_rows', { jobId: job.id })).toHaveLength(0);
  } finally {
    await app.store.close();
  }
});

it('removes invited club-manager access from legacy routes when the membership is revoked', async () => {
  const app = await preparedApp(),
    router = createRestApiRouter(app),
    auth: AuthContext = {
      actorId: randomUUID(),
      roles: ['federation'],
      federationIds: [dataset.federationSyncPayload.federations[0].id],
    };
  const post = async (path: string, body: unknown) => {
    const response = await router.handle({
      method: 'POST',
      path: `/api/v1/platform/${path}`,
      headers: {},
      query: {},
      body,
      auth,
    });
    expect(response.status, JSON.stringify(response.body)).toBeLessThan(300);
    return response.body as { id: string; rootUnitId: string; token: string; code: string };
  };
  try {
    const org = await post('organizations', {
        name: 'Club manager access',
        kind: 'sports',
        federationId: auth.federationIds![0],
      }),
      club = dataset.federationSyncPayload.clubs[0];
    const invitation = await post('invitations', {
      organizationId: org.id,
      unitId: org.rootUnitId,
      role: 'club_manager',
      clubId: club.id,
      displayName: 'New manager',
    });
    const activation = await router.handle({
      method: 'POST',
      path: '/api/v1/platform/activate',
      headers: {},
      query: {},
      body: { token: invitation.token, password: 'Club-manager-test-password-2026!' },
    });
    expect(activation.status).toBe(200);
    const login = await router.handle({
      method: 'POST',
      path: '/api/v1/auth/login',
      headers: {},
      query: {},
      body: { email: invitation.code, password: 'Club-manager-test-password-2026!' },
    });
    expect(login.status).toBe(200);
    const session = login.body as { accessToken: string; user: { id: string } },
      headers = { authorization: `Bearer ${session.accessToken}` };
    expect(
      (await router.handle({ method: 'GET', path: `/api/v1/clubs/${club.id}`, headers, query: {} }))
        .status,
    ).toBe(200);
    const membership = (
      await new PlatformStore(app.store).find<Membership>('memberships', {
        actorId: session.user.id,
        active: true,
      })
    )[0];
    await post(`memberships/${membership.id}/revoke`, {});
    expect(
      (await router.handle({ method: 'GET', path: `/api/v1/clubs/${club.id}`, headers, query: {} }))
        .status,
    ).toBe(403);
  } finally {
    await app.store.close();
  }
});
