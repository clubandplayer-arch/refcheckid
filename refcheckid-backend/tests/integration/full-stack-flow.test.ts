import { expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/router.js';
import { lineup, login, plan, preparedApp } from '../runtime-fixtures.js';

it('enforces club ownership and referee-only recognition over the public API', async () => {
  const app = await preparedApp();
  const router = createRestApiRouter(app);
  const home = await login(router, 'homeManager');
  const away = await login(router, 'awayManager');
  const post = (path: string, headers: Record<string, string>, body = {}) => router.handle({ method: 'POST', path: `/api/v1${path}`, headers, query: {}, body });
  try {
    expect(await post(`/match-sheets/${plan.homeSheetId}/submit`, away, lineup('homeManager'))).toMatchObject({ status: 403 });
    expect(await post(`/match-sheets/${plan.homeSheetId}/submit`, home, lineup('homeManager'))).toMatchObject({ status: 200 });
    expect(await post('/recognitions/start', home, { matchId: plan.matchId })).toMatchObject({ status: 403 });
    expect(await app.repositories.matchSheets.findById(plan.awaySheetId)).toMatchObject({ status: 'draft' });
  } finally { await app.store.close(); }
});
