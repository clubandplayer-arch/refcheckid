import { describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { ids, match, matchSheet } from '../test-fixtures.js';

const regressionCases = [
  {
    id: 'REG-AUTH-001',
    title: 'recognition cannot start while any match sheet is unlocked',
    run: async () => {
      const app = createApplicationContainer();
      await app.repositories.matchSheets.upsert(matchSheet(ids.homeSheet, ids.homeClub, { status: 'submitted' }));
      await expect(app.services.recognitions.startRecognition(ids.match)).rejects.toThrow('cannot start');
    },
  },
  {
    id: 'REG-REPORT-001',
    title: 'submitted reports cannot be edited',
    run: async () => {
      const app = createApplicationContainer();
      await app.repositories.matches.upsert(match({ status: 'completed' }));
      const report = await app.services.matchReports.createMatchReport({ matchId: ids.match, refereeId: ids.referee, summary: 'Finale' });
      await app.services.matchReports.submitMatchReport(report.id);
      await expect(app.services.matchReports.updateMatchReport(report.id, { summary: 'Mutato' })).rejects.toThrow('submitted');
    },
  },
];

describe('automated regression suite', () => {
  it.each(regressionCases)('$id $title', async ({ run }) => {
    await run();
  });
});
