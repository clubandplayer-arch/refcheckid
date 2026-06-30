import { describe, expect, it } from 'vitest';
import type { MatchSheet, MatchSheetStatus, UUID } from '../src/domain/index.js';
import type { MatchSheetRepositoryPort } from '../src/repositories/index.js';
import {
  LockedMatchSheetError,
  MatchSheetNotFoundError,
  MatchSheetService,
} from '../src/services/index.js';

const matchSheetId = '10000000-0000-0000-0000-000000000001';
const matchId = '10000000-0000-0000-0000-000000000002';
const clubId = '10000000-0000-0000-0000-000000000003';

function buildMatchSheet(status: MatchSheetStatus = 'draft'): MatchSheet {
  return {
    id: matchSheetId,
    matchId,
    clubId,
    submittedAt: status === 'submitted' || status === 'locked' ? '2026-06-30T12:00:00.000Z' : null,
    status,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    deletedAt: null,
  };
}

class FakeMatchSheetRepository implements MatchSheetRepositoryPort {
  readonly matchSheets = new Map<UUID, MatchSheet>();
  readonly statusUpdates: Array<{ id: UUID; status: MatchSheetStatus }> = [];

  constructor(initialMatchSheets: readonly MatchSheet[] = []) {
    for (const matchSheet of initialMatchSheets) {
      this.matchSheets.set(matchSheet.id, matchSheet);
    }
  }

  findById(id: UUID): Promise<MatchSheet | null> {
    return Promise.resolve(this.matchSheets.get(id) ?? null);
  }

  listByMatch(targetMatchId: UUID): Promise<readonly MatchSheet[]> {
    return Promise.resolve(
      [...this.matchSheets.values()].filter((matchSheet) => matchSheet.matchId === targetMatchId),
    );
  }

  listByClub(targetClubId: UUID): Promise<readonly MatchSheet[]> {
    return Promise.resolve(
      [...this.matchSheets.values()].filter((matchSheet) => matchSheet.clubId === targetClubId),
    );
  }

  updateStatus(id: UUID, status: MatchSheetStatus): Promise<MatchSheet> {
    const matchSheet = this.matchSheets.get(id);

    if (matchSheet === undefined) {
      throw new MatchSheetNotFoundError(id);
    }

    const updatedMatchSheet = { ...matchSheet, status };
    this.matchSheets.set(id, updatedMatchSheet);
    this.statusUpdates.push({ id, status });

    return Promise.resolve(updatedMatchSheet);
  }
}

describe('MatchSheetService', () => {
  it('gets a match sheet by id', async () => {
    const matchSheet = buildMatchSheet();
    const repository = new FakeMatchSheetRepository([matchSheet]);
    const service = new MatchSheetService({ matchSheetsRepository: repository });

    await expect(service.getMatchSheetById(matchSheet.id)).resolves.toEqual(matchSheet);
  });

  it('lists match sheets by match', async () => {
    const matchSheet = buildMatchSheet();
    const repository = new FakeMatchSheetRepository([matchSheet]);
    const service = new MatchSheetService({ matchSheetsRepository: repository });

    await expect(service.listMatchSheetsByMatch(matchId)).resolves.toEqual([matchSheet]);
  });

  it('lists match sheets by club', async () => {
    const matchSheet = buildMatchSheet();
    const repository = new FakeMatchSheetRepository([matchSheet]);
    const service = new MatchSheetService({ matchSheetsRepository: repository });

    await expect(service.listMatchSheetsByClub(clubId)).resolves.toEqual([matchSheet]);
  });

  it('submits a draft match sheet', async () => {
    const matchSheet = buildMatchSheet('draft');
    const repository = new FakeMatchSheetRepository([matchSheet]);
    const service = new MatchSheetService({ matchSheetsRepository: repository });

    await expect(service.submitMatchSheet(matchSheet.id)).resolves.toMatchObject({
      id: matchSheet.id,
      status: 'submitted',
    });
    expect(repository.statusUpdates).toEqual([{ id: matchSheet.id, status: 'submitted' }]);
  });

  it('locks a submitted match sheet', async () => {
    const matchSheet = buildMatchSheet('submitted');
    const repository = new FakeMatchSheetRepository([matchSheet]);
    const service = new MatchSheetService({ matchSheetsRepository: repository });

    await expect(service.lockMatchSheet(matchSheet.id)).resolves.toMatchObject({
      id: matchSheet.id,
      status: 'locked',
    });
    expect(repository.statusUpdates).toEqual([{ id: matchSheet.id, status: 'locked' }]);
  });

  it('returns the current match sheet when status is unchanged', async () => {
    const matchSheet = buildMatchSheet('submitted');
    const repository = new FakeMatchSheetRepository([matchSheet]);
    const service = new MatchSheetService({ matchSheetsRepository: repository });

    await expect(service.submitMatchSheet(matchSheet.id)).resolves.toEqual(matchSheet);
    expect(repository.statusUpdates).toEqual([]);
  });

  it('rejects submit after lock', async () => {
    const matchSheet = buildMatchSheet('locked');
    const repository = new FakeMatchSheetRepository([matchSheet]);
    const service = new MatchSheetService({ matchSheetsRepository: repository });

    await expect(service.submitMatchSheet(matchSheet.id)).rejects.toBeInstanceOf(
      LockedMatchSheetError,
    );
  });

  it('rejects missing match sheets', async () => {
    const repository = new FakeMatchSheetRepository();
    const service = new MatchSheetService({ matchSheetsRepository: repository });

    await expect(service.submitMatchSheet(matchSheetId)).rejects.toBeInstanceOf(
      MatchSheetNotFoundError,
    );
  });
});
