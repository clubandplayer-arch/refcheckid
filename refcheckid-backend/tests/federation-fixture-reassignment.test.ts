import { expect, it } from 'vitest';
import { preparedApp, plan } from './runtime-fixtures.js';

it.each(['homeClubId', 'awayClubId'] as const)(
  'rejects %s reassignment before changing a scheduled fixture or creating an obsolete sheet', async (side) => {
    const app = await preparedApp();
    try {
      const before = await app.repositories.matches.findById(plan.matchId);
      if (!before) throw new Error('Missing fixture');
      const sheets = await app.repositories.matchSheets.listByMatch(plan.matchId);
      expect(sheets).toHaveLength(2);
      await expect(app.services.federationSync.syncMatches([{ ...before,
        [side]: '80000000-0000-4000-8000-000000000003' }])).rejects.toThrow('Cannot change the clubs');
      expect(await app.repositories.matches.findById(plan.matchId)).toEqual(before);
      expect(await app.repositories.matchSheets.listByMatch(plan.matchId)).toEqual(sheets);
      // Repeating a sync of the same clubs remains idempotent.
      await app.services.federationSync.syncMatches([before]);
      expect(await app.repositories.matchSheets.listByMatch(plan.matchId)).toEqual(sheets);
    } finally { await app.store.close(); }
  });
