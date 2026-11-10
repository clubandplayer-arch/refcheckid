import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/router.js';
import { dataset, lineup, login, plan, preparedApp } from '../runtime-fixtures.js';

describe('complete role-separated public API workflow', () => {
  it('submits both lineups, records every decision and delivers a report to the federation', async () => {
    const app = await preparedApp();
    const router = createRestApiRouter(app);
    const home = await login(router, 'homeManager');
    const away = await login(router, 'awayManager');
    const referee = await login(router, 'referee');
    const federation = await login(router, 'federation');
    const post = (path: string, headers: Record<string, string>, body = {}) => router.handle({ method: 'POST', path: `/api/v1${path}`, headers, query: {}, body });
    try {
      for (const [manager, sheet, headers] of [['homeManager', plan.homeSheetId, home], ['awayManager', plan.awaySheetId, away]] as const) {
        expect(await post(`/match-sheets/${sheet}/submit`, headers, lineup(manager))).toMatchObject({ status: 200, body: { status: 'submitted' } });
        expect(await post(`/match-sheets/${sheet}/lock`, referee)).toMatchObject({ status: 200, body: { status: 'locked' } });
      }
      expect(await post('/recognitions/start', referee, { matchId: plan.matchId })).toMatchObject({ status: 200, body: { status: 'in_progress' } });
      expect(await post('/recognitions/complete', referee, { matchId: plan.matchId })).toMatchObject({ status: 409 });
      for (const person of dataset.photoPlan) {
        expect(await post('/recognitions/decision', referee, { matchId: plan.matchId, registrationId: person.registrationId, status: 'recognized', notes: 'Document checked; photo unavailable in this fixture.' })).toMatchObject({ status: 200 });
      }
      expect(await post('/recognitions/complete', referee, { matchId: plan.matchId })).toMatchObject({ status: 200, body: { status: 'locked' } });
      const summary = JSON.stringify({ matchId: plan.matchId, result: { homeGoals: 0, awayGoals: 0 }, goals: [], cautions: [], expulsions: [], substitutions: [], refereeNotes: 'Gara regolare.' });
      const submitted = await post(`/matches/${plan.matchId}/final-report`, referee, { summary });
      expect(submitted).toMatchObject({ status: 200, body: { status: 'submitted' } });
      const storedSummary = (submitted.body as { summary: string }).summary;
      expect(JSON.parse(storedSummary)).toMatchObject({ homeTeam: 'ASD RefCheck Home', awayTeam: 'ASD RefCheck Away', result: { homeGoals: 0, awayGoals: 0 } });
      expect(await router.handle({ method: 'GET', path: '/api/v1/match-reports', headers: federation, query: { matchId: plan.matchId } })).toMatchObject({ status: 200, body: { status: 'submitted', summary: storedSummary } });
      expect((await app.repositories.audit.listByMatch(plan.matchId)).length).toBeGreaterThan(44);
    } finally { await app.store.close(); }
  });
});
