import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { sportCatalog, isSportId, hasDetailedResults } from '../src/platform/sports.js';
import { preparedApp, dataset } from './runtime-fixtures.js';
import { Imports } from '../src/platform/imports.js';
import { createRestApiRouter } from '../src/api/router.js';
it('keeps one stable catalog for every requested team-sport discipline and variant', () => {
  expect(sportCatalog).toHaveLength(36);
  expect(new Set(sportCatalog.map((s) => s.id)).size).toBe(36);
  for (const sport of sportCatalog) expect(isSportId(sport.id)).toBe(true);
  expect(isSportId('not-a-sport')).toBe(false);
  expect(sportCatalog.filter((s) => s.detailedResults).map((s) => s.id)).toEqual([
    'football',
    'basketball',
    'volleyball',
  ]);
  expect(hasDetailedResults('rugby_union')).toBe(false);
  expect(sportCatalog.find((s) => s.id === 'quadball')?.name).toContain('Quidditch');
});
it('accepts new sports for teams and officials, exposes the same public catalog and prevents applying volleyball rules to them', async () => {
  const app = await preparedApp(),
    service = new Imports(app, {
      actorId: randomUUID(),
      roles: ['federation'],
      federationIds: [dataset.federationSyncPayload.federations[0].id],
    });
  try {
    const org = await service.create({
        name: 'Catalog test',
        kind: 'sports',
        federationId: service.auth.federationIds![0],
      }),
      scope = { organizationId: org.id, unitId: org.rootUnitId };
    const club = await service.createClub({ ...scope, code: 'SPORTS', name: 'Sports club' });
    const team = await service.createTeam({
      ...scope,
      clubId: club.clubId,
      code: 'RUGBY',
      name: 'Rugby team',
      sport: 'rugby_union',
      season: '2026',
      category: 'Open',
    });
    expect(team.sport).toBe('rugby_union');
    const referee = await service.createOfficial({
      ...scope,
      code: 'MULTI',
      firstName: 'Test',
      lastName: 'Official',
      sports: 'rugby_union,flag_football,quadball',
    });
    expect(referee.sports).toEqual(['rugby_union', 'flag_football', 'quadball']);
    await expect(
      service.createCompetition({
        ...scope,
        name: 'Rugby league',
        sport: 'rugby_union',
        season: '2026',
        category: 'Open',
      }),
    ).rejects.toThrow(/regolamento/);
    const response = await createRestApiRouter(app).handle({
      method: 'GET',
      path: '/api/v1/public/sports',
      query: {},
      headers: {},
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: sportCatalog });
  } finally {
    await app.store.close();
  }
});
