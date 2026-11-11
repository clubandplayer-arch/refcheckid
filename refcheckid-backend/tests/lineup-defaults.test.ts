import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { preparedApp, login, plan } from './runtime-fixtures.js';
import { createApplicationContainer } from '../src/config/application-container.js';
import { createRestApiRouter } from '../src/api/router.js';

it('recalls saved numbers and duties after restart, scoped to the club and earlier games in the same season', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'refcheckid-lineup-defaults-'));
  const path = join(dir, 'runtime.sqlite');
  let app = await preparedApp(path);
  try {
    const source = (await app.repositories.matchSheets.findById(plan.homeSheetId))!;
    const previousMatch = (await app.repositories.matches.findById(source.matchId))!;
    const registration = (await app.repositories.registrations.listByClub(source.clubId))[0];
    await app.repositories.matchSheetPlayers.replaceByMatchSheet(source.id, [{
      matchSheetId: source.id, playerRegistrationId: registration.id, shirtNumber: 77,
      role: 'reserve', lineupOrder: 0, isGoalkeeper: true, isCaptain: false,
      isViceCaptain: true, status: 'listed',
    }]);
    const target = await app.repositories.matches.create({ ...previousMatch, id: randomUUID(), scheduledAt: '2027-01-01T20:00:00.000Z' });
    const targetSheet = await app.repositories.matchSheets.create({ matchId: target.id, clubId: source.clubId, status: 'draft', submittedAt: null });
    // Neither a future match nor a different season may supply defaults.
    for (const change of [{ scheduledAt: '2028-01-01T20:00:00.000Z' }, { season: 'different-season', scheduledAt: '2026-12-30T20:00:00.000Z' }]) {
      const match = await app.repositories.matches.create({ ...previousMatch, ...change, id: randomUUID() });
      const sheet = await app.repositories.matchSheets.create({ matchId: match.id, clubId: source.clubId, status: 'draft', submittedAt: null });
      await app.repositories.matchSheetPlayers.replaceByMatchSheet(sheet.id, [{ matchSheetId: sheet.id,
        playerRegistrationId: registration.id, shirtNumber: 99, role: 'starter', lineupOrder: 0,
        isGoalkeeper: false, isCaptain: true, isViceCaptain: false, status: 'listed' }]);
    }
    await app.store.close();
    app = createApplicationContainer({ databasePath: path, seedDemo: false });
    const router = createRestApiRouter(app);
    const home = await login(router, 'homeManager');
    const away = await login(router, 'awayManager');
    const get = (headers = home, matchId = target.id) => router.handle({ method: 'GET',
      path: `/api/v1/clubs/${source.clubId}/lineup-defaults`, headers, query: { matchId } });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sourceMatchSheetId: source.id, players: [{
      playerRegistrationId: registration.id, shirtNumber: 77, role: 'reserve',
      isGoalkeeper: true, isCaptain: false, isViceCaptain: true,
    }] });
    expect((await get(away)).status).toBe(403);
    expect((await get(home, source.matchId)).body).toEqual({ sourceMatchSheetId: null, players: [] });
    expect(await app.repositories.matchSheetPlayers.listByMatchSheet(targetSheet.id)).toEqual([]);
    expect((await app.repositories.matchSheetPlayers.listByMatchSheet(source.id))[0].shirtNumber).toBe(77);
  } finally { await app.store.close(); await rm(dir, { recursive: true, force: true }); }
});
