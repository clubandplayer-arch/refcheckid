import { expect, it } from 'vitest';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { createRestApiRouter } from '../../src/api/router.js';
import { dataset } from '../runtime-fixtures.js';

it.each(['/api/v1/players', '/api/v1/players/', '//api//v1///players//'])(
  'keeps federation collection scope for equivalent path %s', async (path) => {
    const app = createApplicationContainer({ seedDemo: false });
    try {
      const own = { ...dataset.federationSyncPayload.players[0], status: 'active' as const };
      const other = { ...own, id: '80000000-0000-4000-8000-000000000001', federationId: '80000000-0000-4000-8000-000000000002' };
      await app.repositories.players.upsert(own);
      await app.repositories.players.upsert(other);
      const response = await createRestApiRouter(app).handle({ method: 'GET', path, headers: {}, query: {},
        auth: { actorId: '90000000-0000-4000-8000-000000000003', roles: ['federation'], federationIds: [own.federationId] } });
      expect(response.status).toBe(200);
      expect((response.body as { id: string }[]).map((row) => row.id)).toEqual([own.id]);
    } finally { await app.store.close(); }
  });

it.each(['/api/v1/federation-sync', '/api/v1/federation-sync/', '//api//v1///federation-sync//'])(
  'denies manager synchronization for equivalent path %s', async (path) => {
    const app = createApplicationContainer({ seedDemo: false });
    try {
      const response = await createRestApiRouter(app).handle({ method: 'POST', path, headers: {}, query: {},
        body: dataset.federationSyncPayload,
        auth: { actorId: '90000000-0000-4000-8000-000000000001', roles: ['manager'], clubIds: [] } });
      expect(response.status).toBe(403);
      expect(await app.repositories.players.list()).toEqual([]);
      expect(await app.repositories.matches.list()).toEqual([]);
    } finally { await app.store.close(); }
  });
