import { describe, expect, it } from 'vitest';
import type { MatchSheet, MatchSheetStatus, UUID } from '../src/domain/index.js';
import type { MatchSheetRepositoryPort } from '../src/repositories/index.js';
import {
  LockedMatchSheetError,
  MatchSheetPhotoManifestIncompleteError,
  MatchSheetNotFoundError,
  MatchSheetService,
} from '../src/services/index.js';
import { createApplicationContainer } from '../src/config/application-container.js';
import { pilotIds } from '../src/config/pilot-data.js';

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

  it('rebuilds a partial persisted photo manifest when an already locked sheet is locked again', async () => {
    const container = createApplicationContainer();
    const now = '2026-08-07T12:00:00.000Z';
    const playerIds = [
      '10000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000102',
    ];
    const registrationIds = [
      '10000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000202',
    ];

    for (const [index, playerId] of playerIds.entries()) {
      await container.repositories.players.upsert({
        id: playerId,
        federationId: pilotIds.federation,
        firstName: `Player ${index + 1}`,
        lastName: 'Restart',
        birthDate: '2000-01-01',
        birthPlace: null,
        fiscalCode: null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      await container.repositories.registrations.upsert({
        id: registrationIds[index],
        playerId,
        clubId: pilotIds.homeClub,
        season: '2026',
        registrationNumber: `RESTART-${index + 1}`,
        status: 'active',
        registeredAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    await container.repositories.matchSheetPlayers.replaceByMatchSheet(pilotIds.homeSheet, [
      {
        matchSheetId: pilotIds.homeSheet,
        playerRegistrationId: registrationIds[0],
        shirtNumber: 1,
        role: 'starter',
        lineupOrder: 0,
        isGoalkeeper: true,
        isCaptain: false,
        isViceCaptain: false,
        status: 'listed',
      },
      {
        matchSheetId: pilotIds.homeSheet,
        playerRegistrationId: registrationIds[1],
        shirtNumber: 2,
        role: 'starter',
        lineupOrder: 1,
        isGoalkeeper: false,
        isCaptain: true,
        isViceCaptain: false,
        status: 'listed',
      },
    ]);
    await container.repositories.matchSheets.updateStatus(pilotIds.homeSheet, 'locked');
    const staleSnapshot = await container.repositories.matchSheetPhotoSnapshots.create({
      matchSheetId: pilotIds.homeSheet,
      matchId: pilotIds.match,
      registrationId: registrationIds[0],
      seasonRegistrationPhotoId: null,
      photoSubjectId: null,
      globalOfficialPhotoId: null,
      photoVersionId: null,
      photoEtag: null,
      photoStatus: 'missing',
      renditionManifest: {},
      frozenAt: now,
      frozenByUserId: pilotIds.federation,
      freezeReason: 'match_sheet_locked',
      auditCorrelationId: '10000000-0000-4000-8000-000000000301',
    });

    await container.services.matchSheets.lockMatchSheet(pilotIds.homeSheet);

    const activeSnapshots = await container.repositories.matchSheetPhotoSnapshots.listByMatchSheet(
      pilotIds.homeSheet,
    );
    expect(activeSnapshots.map((snapshot) => snapshot.registrationId).sort()).toEqual(
      [...registrationIds].sort(),
    );
    expect(activeSnapshots).toHaveLength(2);
    const archivedSnapshot = await container.repositories.matchSheetPhotoSnapshots.findById(
      staleSnapshot.id,
    );
    expect(typeof archivedSnapshot?.deletedAt).toBe('string');
  });

  it('preserves persisted snapshots when the runtime lineup is unexpectedly empty', async () => {
    const container = createApplicationContainer();
    await container.repositories.matchSheets.updateStatus(pilotIds.homeSheet, 'locked');
    const persistedSnapshot = await container.repositories.matchSheetPhotoSnapshots.create({
      matchSheetId: pilotIds.homeSheet,
      matchId: pilotIds.match,
      registrationId: '10000000-0000-4000-8000-000000000401',
      seasonRegistrationPhotoId: null,
      photoSubjectId: null,
      globalOfficialPhotoId: null,
      photoVersionId: null,
      photoEtag: null,
      photoStatus: 'active',
      renditionManifest: {},
      frozenAt: '2026-08-07T12:00:00.000Z',
      frozenByUserId: pilotIds.federation,
      freezeReason: 'match_sheet_locked',
      auditCorrelationId: '10000000-0000-4000-8000-000000000402',
    });

    await expect(
      container.services.matchSheets.lockMatchSheet(pilotIds.homeSheet),
    ).rejects.toBeInstanceOf(MatchSheetPhotoManifestIncompleteError);
    await expect(
      container.repositories.matchSheetPhotoSnapshots.listByMatchSheet(pilotIds.homeSheet),
    ).resolves.toEqual([persistedSnapshot]);
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

  it('fully resets the demo match workflow instead of only reopening one sheet', async () => {
    const container = createApplicationContainer();
    await container.repositories.matchSheets.updateStatus(pilotIds.homeSheet, 'locked');
    await container.repositories.matchSheets.updateStatus(pilotIds.awaySheet, 'locked');
    await container.repositories.matchSheetPlayers.replaceByMatchSheet(pilotIds.homeSheet, [
      {
        matchSheetId: pilotIds.homeSheet,
        playerRegistrationId: '10000000-0000-0000-0000-000000000010',
        shirtNumber: 1,
        role: 'starter',
        lineupOrder: 0,
        isGoalkeeper: true,
        isCaptain: true,
        isViceCaptain: false,
        status: 'listed',
      },
    ]);
    await container.repositories.recognitions.updateWorkflowStatus(pilotIds.match, 'locked');
    await container.repositories.matches.updateStatus(pilotIds.match, 'completed');

    await container.services.matchSheets.resetSmokeMatchSheet(pilotIds.homeSheet);

    await expect(
      container.repositories.matchSheets.findById(pilotIds.homeSheet),
    ).resolves.toMatchObject({
      status: 'draft',
    });
    await expect(
      container.repositories.matchSheets.findById(pilotIds.awaySheet),
    ).resolves.toMatchObject({
      status: 'draft',
    });
    await expect(
      container.repositories.matchSheetPlayers.listByMatchSheet(pilotIds.homeSheet),
    ).resolves.toEqual([]);
    await expect(
      container.repositories.recognitions.getWorkflowByMatch(pilotIds.match),
    ).resolves.toEqual({
      matchId: pilotIds.match,
      status: 'not_started',
    });
    await expect(container.repositories.matches.findById(pilotIds.match)).resolves.toMatchObject({
      status: 'scheduled',
    });
  });
});
