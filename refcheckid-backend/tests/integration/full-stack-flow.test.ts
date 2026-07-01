import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/index.js';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { authHeaders, ids, match, matchSheet } from '../test-fixtures.js';

describe('integration: frontend to REST API to backend repositories', () => {
  it('executes the main match sheet, recognition, report, and federation read flow', async () => {
    const container = createApplicationContainer();
    await container.repositories.matches.upsert(match());
    await container.repositories.matchSheets.upsert(matchSheet(ids.homeSheet, ids.homeClub));
    await container.repositories.matchSheets.upsert(matchSheet(ids.awaySheet, ids.awayClub));
    const router = createRestApiRouter(container);

    await expect(router.handle({ method: 'GET', path: '/api/v1/matches', headers: authHeaders, query: {} })).resolves.toMatchObject({ status: 200 });
    await expect(router.handle({ method: 'POST', path: `/api/v1/match-sheets/${ids.homeSheet}/submit`, headers: authHeaders, query: {} })).resolves.toMatchObject({ status: 200, body: { status: 'submitted' } });
    await router.handle({ method: 'POST', path: `/api/v1/match-sheets/${ids.homeSheet}/lock`, headers: authHeaders, query: {} });
    await router.handle({ method: 'POST', path: `/api/v1/match-sheets/${ids.awaySheet}/lock`, headers: authHeaders, query: {} });
    await expect(router.handle({ method: 'POST', path: '/api/v1/recognitions/start', headers: authHeaders, query: {}, body: { matchId: ids.match } })).resolves.toMatchObject({ status: 200, body: { status: 'in_progress' } });
    await router.handle({ method: 'POST', path: '/api/v1/recognitions/complete', headers: authHeaders, query: {}, body: { matchId: ids.match } });
    await router.handle({ method: 'POST', path: `/api/v1/matches/${ids.match}/status`, headers: authHeaders, query: {}, body: { status: 'in_progress' } });
    await router.handle({ method: 'POST', path: `/api/v1/matches/${ids.match}/status`, headers: authHeaders, query: {}, body: { status: 'completed' } });
    const created = await router.handle({ method: 'POST', path: '/api/v1/match-reports', headers: authHeaders, query: {}, body: { matchId: ids.match, refereeId: ids.referee, summary: 'Gara regolare.' } });
    expect(created).toMatchObject({ status: 201, body: { matchId: ids.match, summary: 'Gara regolare.' } });
    const reportId = (created.body as { id: string }).id;
    await expect(router.handle({ method: 'POST', path: `/api/v1/match-reports/${reportId}/submit`, headers: authHeaders, query: {} })).resolves.toMatchObject({ status: 200, body: { status: 'submitted' } });
    await expect(router.handle({ method: 'GET', path: '/api/v1/match-reports', headers: authHeaders, query: { matchId: ids.match } })).resolves.toMatchObject({ status: 200, body: { id: reportId } });
  });
});
