import { expect, it } from 'vitest';
import { createRestApiRouter } from '../src/api/router.js';
import { dataset, lockedApp, login, plan } from './runtime-fixtures.js';

it('validates the score and recognized participants on the server and rolls back invalid finalization', async () => {
  const app = await lockedApp();
  const router = createRestApiRouter(app);
  const referee = await login(router, 'referee');
  try {
    await app.services.recognitions.startRecognition(plan.matchId);
    for (const [index, person] of dataset.photoPlan.entries()) await app.services.recognitions.recordDecision(plan.matchId, person.registrationId, index === 0 ? 'rejected' : 'recognized', 'Document check', 'referee');
    await app.services.recognitions.completeRecognition(plan.matchId);
    const send = (shirt: number, homeGoals = 1) => router.handle({ method: 'POST', path: `/api/v1/matches/${plan.matchId}/final-report`, headers: referee, query: {}, body: { summary: JSON.stringify({ matchId: plan.matchId,
      result: { homeGoals, awayGoals: 0 }, goals: [{ id: 'goal', minute: 20, teamName: 'Casa', shirtNumber: shirt, playerName: 'Client supplied identity', detail: 'Azione' }], cautions: [], expulsions: [], substitutions: [] }) } });
    expect((await send(1)).status).toBe(409); // Rejected participant cannot score.
    expect((await send(12)).status).toBe(409); // Reserve has not entered.
    expect((await send(2, 2)).status).toBe(409); // Score and goal events disagree.
    expect((await app.repositories.matches.findById(plan.matchId))?.status).toBe('scheduled');
    const response = await send(2);
    expect(response.status).toBe(200);
    const content = JSON.parse((response.body as { summary: string }).summary) as { goals: { playerName: string; registrationId: string }[] };
    expect(content.goals[0].registrationId).toBe(dataset.photoPlan[1].registrationId);
    expect(content.goals[0].playerName).not.toBe('Client supplied identity');
    const report = response.body as { id: string };
    await expect(app.services.matchReports.updateMatchReport(report.id, { summary: 'changed' })).rejects.toThrow('submitted');
  } finally { await app.store.close(); }
});
