import { describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { ids, match, matchSheet } from '../test-fixtures.js';

describe('e2e happy path: manager, referee, federation', () => {
  it('allows the manager to submit lineups, referee to recognize and report, federation to receive report', async () => {
    const app = createApplicationContainer();
    await app.repositories.matches.upsert(match({ status: 'scheduled' }));
    await app.repositories.matchSheets.upsert(matchSheet(ids.homeSheet, ids.homeClub));
    await app.repositories.matchSheets.upsert(matchSheet(ids.awaySheet, ids.awayClub));

    await app.services.matchSheets.submitMatchSheet(ids.homeSheet);
    await app.services.matchSheets.lockMatchSheet(ids.homeSheet);
    await app.services.matchSheets.lockMatchSheet(ids.awaySheet);
    await expect(app.services.recognitions.startRecognition(ids.match)).resolves.toMatchObject({ status: 'in_progress' });
    await expect(app.services.recognitions.completeRecognition(ids.match)).resolves.toMatchObject({ status: 'locked' });
    await app.services.matches.transitionMatchStatus(ids.match, 'in_progress');
    await app.services.matches.transitionMatchStatus(ids.match, 'completed');
    const report = await app.services.matchReports.createMatchReport({ matchId: ids.match, refereeId: ids.referee, summary: 'Referto completo.' });
    await app.services.matchReports.submitMatchReport(report.id);

    await expect(app.services.matchReports.getMatchReportByMatch(ids.match)).resolves.toMatchObject({ status: 'submitted', summary: 'Referto completo.' });
  });
});
