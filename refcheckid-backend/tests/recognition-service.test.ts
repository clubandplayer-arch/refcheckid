import { describe, expect, it } from 'vitest';
import type {
  MatchSheet,
  MatchSheetStatus,
  Recognition,
  RecognitionWorkflow,
  RecognitionWorkflowStatus,
  UUID,
} from '../src/domain/index.js';
import type {
  MatchSheetRepositoryPort,
  RecognitionRepositoryPort,
} from '../src/repositories/index.js';
import {
  CompletedRecognitionError,
  InvalidRecognitionWorkflowTransitionError,
  MatchSheetsNotLockedError,
  RecognitionService,
} from '../src/services/index.js';

const recognitionId = '20000000-0000-0000-0000-000000000001';
const matchId = '20000000-0000-0000-0000-000000000002';
const refereeId = '20000000-0000-0000-0000-000000000003';
const clubId = '20000000-0000-0000-0000-000000000004';

function buildMatchSheet(id: UUID, status: MatchSheetStatus = 'locked'): MatchSheet {
  return {
    id,
    matchId,
    clubId,
    submittedAt: '2026-06-30T12:00:00.000Z',
    status,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    deletedAt: null,
  };
}

function buildRecognition(): Recognition {
  return {
    id: recognitionId,
    matchId,
    refereeId,
    matchSheetPlayerId: null,
    matchSheetStaffId: null,
    recognizedAt: '2026-06-30T13:00:00.000Z',
    status: 'recognized',
    notes: null,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    deletedAt: null,
  };
}

class FakeMatchSheetRepository implements MatchSheetRepositoryPort {
  constructor(private readonly matchSheets: readonly MatchSheet[] = []) {}

  findById(): Promise<MatchSheet | null> {
    return Promise.resolve(null);
  }

  listByMatch(targetMatchId: UUID): Promise<readonly MatchSheet[]> {
    return Promise.resolve(
      this.matchSheets.filter((matchSheet) => matchSheet.matchId === targetMatchId),
    );
  }

  listByClub(targetClubId: UUID): Promise<readonly MatchSheet[]> {
    return Promise.resolve(
      this.matchSheets.filter((matchSheet) => matchSheet.clubId === targetClubId),
    );
  }

  updateStatus(): Promise<MatchSheet> {
    return Promise.reject(new Error('FakeMatchSheetRepository.updateStatus is not implemented.'));
  }
}

class FakeRecognitionRepository implements RecognitionRepositoryPort {
  readonly workflowUpdates: Array<{ matchId: UUID; status: RecognitionWorkflowStatus }> = [];

  constructor(
    private readonly recognitions: readonly Recognition[] = [],
    private workflow: RecognitionWorkflow = { matchId, status: 'not_started' },
  ) {}

  findById(id: UUID): Promise<Recognition | null> {
    return Promise.resolve(this.recognitions.find((recognition) => recognition.id === id) ?? null);
  }

  listByMatch(targetMatchId: UUID): Promise<readonly Recognition[]> {
    return Promise.resolve(
      this.recognitions.filter((recognition) => recognition.matchId === targetMatchId),
    );
  }

  getWorkflowByMatch(targetMatchId: UUID): Promise<RecognitionWorkflow> {
    return Promise.resolve({ ...this.workflow, matchId: targetMatchId });
  }

  updateWorkflowStatus(
    targetMatchId: UUID,
    status: RecognitionWorkflowStatus,
  ): Promise<RecognitionWorkflow> {
    this.workflow = { matchId: targetMatchId, status };
    this.workflowUpdates.push({ matchId: targetMatchId, status });

    return Promise.resolve(this.workflow);
  }
}

describe('RecognitionService', () => {
  it('gets a recognition by id', async () => {
    const recognition = buildRecognition();
    const recognitionsRepository = new FakeRecognitionRepository([recognition]);
    const service = new RecognitionService({
      matchSheetsRepository: new FakeMatchSheetRepository(),
      recognitionsRepository,
    });

    await expect(service.getRecognitionById(recognition.id)).resolves.toEqual(recognition);
  });

  it('lists recognitions by match', async () => {
    const recognition = buildRecognition();
    const recognitionsRepository = new FakeRecognitionRepository([recognition]);
    const service = new RecognitionService({
      matchSheetsRepository: new FakeMatchSheetRepository(),
      recognitionsRepository,
    });

    await expect(service.listRecognitionsByMatch(matchId)).resolves.toEqual([recognition]);
  });

  it('starts recognition when all match sheets are locked', async () => {
    const recognitionsRepository = new FakeRecognitionRepository();
    const service = new RecognitionService({
      matchSheetsRepository: new FakeMatchSheetRepository([
        buildMatchSheet('20000000-0000-0000-0000-000000000101'),
        buildMatchSheet('20000000-0000-0000-0000-000000000102'),
      ]),
      recognitionsRepository,
    });

    await expect(service.startRecognition(matchId)).resolves.toEqual({
      matchId,
      status: 'in_progress',
    });
    expect(recognitionsRepository.workflowUpdates).toEqual([{ matchId, status: 'in_progress' }]);
  });

  it('rejects starting recognition while any match sheet is not locked', async () => {
    const service = new RecognitionService({
      matchSheetsRepository: new FakeMatchSheetRepository([
        buildMatchSheet('20000000-0000-0000-0000-000000000101', 'locked'),
        buildMatchSheet('20000000-0000-0000-0000-000000000102', 'submitted'),
      ]),
      recognitionsRepository: new FakeRecognitionRepository(),
    });

    await expect(service.startRecognition(matchId)).rejects.toBeInstanceOf(
      MatchSheetsNotLockedError,
    );
  });

  it('keeps in-progress recognition unchanged when started again', async () => {
    const recognitionsRepository = new FakeRecognitionRepository([], {
      matchId,
      status: 'in_progress',
    });
    const service = new RecognitionService({
      matchSheetsRepository: new FakeMatchSheetRepository([
        buildMatchSheet('20000000-0000-0000-0000-000000000101'),
      ]),
      recognitionsRepository,
    });

    await expect(service.startRecognition(matchId)).resolves.toEqual({
      matchId,
      status: 'in_progress',
    });
    expect(recognitionsRepository.workflowUpdates).toEqual([]);
  });

  it('rejects starting locked recognition', async () => {
    const service = new RecognitionService({
      matchSheetsRepository: new FakeMatchSheetRepository([
        buildMatchSheet('20000000-0000-0000-0000-000000000101'),
      ]),
      recognitionsRepository: new FakeRecognitionRepository([], { matchId, status: 'locked' }),
    });

    await expect(service.startRecognition(matchId)).rejects.toBeInstanceOf(
      CompletedRecognitionError,
    );
  });

  it('locks in-progress recognition', async () => {
    const recognitionsRepository = new FakeRecognitionRepository([], {
      matchId,
      status: 'in_progress',
    });
    const service = new RecognitionService({
      matchSheetsRepository: new FakeMatchSheetRepository(),
      recognitionsRepository,
    });

    await expect(service.completeRecognition(matchId)).resolves.toEqual({
      matchId,
      status: 'locked',
    });
    expect(recognitionsRepository.workflowUpdates).toEqual([{ matchId, status: 'locked' }]);
  });

  it('rejects completing recognition before it is started', async () => {
    const service = new RecognitionService({
      matchSheetsRepository: new FakeMatchSheetRepository(),
      recognitionsRepository: new FakeRecognitionRepository(),
    });

    await expect(service.completeRecognition(matchId)).rejects.toBeInstanceOf(
      InvalidRecognitionWorkflowTransitionError,
    );
  });

  it('keeps locked recognition terminal and unchanged', async () => {
    const recognitionsRepository = new FakeRecognitionRepository([], {
      matchId,
      status: 'locked',
    });
    const service = new RecognitionService({
      matchSheetsRepository: new FakeMatchSheetRepository(),
      recognitionsRepository,
    });

    await expect(service.completeRecognition(matchId)).resolves.toEqual({
      matchId,
      status: 'locked',
    });
    expect(recognitionsRepository.workflowUpdates).toEqual([]);
  });
});
