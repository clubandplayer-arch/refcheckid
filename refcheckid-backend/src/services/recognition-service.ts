import type {
  Recognition,
  RecognitionWorkflow,
  RecognitionWorkflowStatus,
  UUID,
} from '../domain/index.js';
import type { EventPublisher } from '../events/index.js';
import type { PhotoService } from './photo-service.js';
import type {
  MatchSheetPlayerRepositoryPort,
  MatchSheetPhotoSnapshotRepository,
  MatchSheetRepositoryPort,
  MatchSheetStaffRepositoryPort,
  RecognitionRepositoryPort,
  MatchRepositoryPort,
} from '../repositories/index.js';

const allowedRecognitionWorkflowTransitions: Readonly<
  Record<RecognitionWorkflowStatus, readonly RecognitionWorkflowStatus[]>
> = {
  not_started: ['in_progress'],
  in_progress: ['locked'],
  locked: [],
};

export class RecognitionNotFoundError extends Error {
  constructor(recognitionId: UUID) {
    super(`Recognition ${recognitionId} was not found.`);
    this.name = 'RecognitionNotFoundError';
  }
}

export class MatchSheetsNotLockedError extends Error {
  constructor(matchId: UUID) {
    super(`Recognition for match ${matchId} cannot start until every match sheet is locked.`);
    this.name = 'MatchSheetsNotLockedError';
  }
}

export class MatchPhotoManifestNotReadyError extends Error {
  constructor(matchId: UUID) {
    super(`Match ${matchId} does not have frozen photo snapshots for referee recognition.`);
    this.name = 'MatchPhotoManifestNotReadyError';
  }
}

export class InvalidRecognitionWorkflowTransitionError extends Error {
  constructor(from: RecognitionWorkflowStatus, to: RecognitionWorkflowStatus) {
    super(`Invalid recognition workflow transition from ${from} to ${to}.`);
    this.name = 'InvalidRecognitionWorkflowTransitionError';
  }
}

export class CompletedRecognitionError extends Error {
  constructor(matchId: UUID) {
    super(`Recognition workflow for match ${matchId} is completed and cannot be modified.`);
    this.name = 'CompletedRecognitionError';
  }
}

export interface RecognitionServiceDependencies {
  readonly photosService?: PhotoService;
  readonly matchesRepository?: MatchRepositoryPort;
  readonly eventPublisher?: EventPublisher;
  readonly matchSheetPlayersRepository?: MatchSheetPlayerRepositoryPort;
  readonly matchSheetsRepository: MatchSheetRepositoryPort;
  readonly matchSheetStaffRepository?: MatchSheetStaffRepositoryPort;
  readonly matchSheetPhotoSnapshotsRepository?: MatchSheetPhotoSnapshotRepository;
  readonly recognitionsRepository: RecognitionRepositoryPort;
}

export class RecognitionService {
  constructor(private readonly dependencies: RecognitionServiceDependencies) {}

  getRecognitionById(recognitionId: UUID): Promise<Recognition | null> {
    return this.dependencies.recognitionsRepository.findById(recognitionId);
  }

  listRecognitionsByMatch(matchId: UUID): Promise<readonly Recognition[]> {
    return this.dependencies.recognitionsRepository.listByMatch(matchId);
  }

  async manifestReady(matchId: UUID): Promise<boolean> {
    try {
      const sheets = await this.assertMatchSheetsLocked(matchId);
      await this.assertPhotoManifestReady(matchId, sheets);
      return true;
    } catch (error) {
      if (error instanceof MatchSheetsNotLockedError || error instanceof MatchPhotoManifestNotReadyError) return false;
      throw error;
    }
  }

  async startRecognition(matchId: UUID): Promise<RecognitionWorkflow> {
    const matchSheets = await this.assertMatchSheetsLocked(matchId);
    await this.assertPhotoManifestReady(matchId, matchSheets);

    const workflow = await this.dependencies.recognitionsRepository.getWorkflowByMatch(matchId);

    if (workflow.status === 'in_progress') {
      return workflow;
    }

    // Starting is an idempotent command. The demo bootstrap may have already completed the
    // workflow before the referee opens the page (and that state can also be restored after a
    // process restart). Returning the terminal workflow lets the referee reopen the frozen
    // manifest instead of surfacing a misleading HTTP 409.
    if (workflow.status === 'locked') {
      return workflow;
    }

    return this.transitionRecognitionWorkflow(matchId, workflow.status, 'in_progress');
  }

  async completeRecognition(matchId: UUID): Promise<RecognitionWorkflow> {
    const workflow = await this.dependencies.recognitionsRepository.getWorkflowByMatch(matchId);

    if (workflow.status === 'locked') {
      return workflow;
    }

    if (this.dependencies.matchesRepository) {
      const sheets = await this.assertMatchSheetsLocked(matchId);
      await this.assertPhotoManifestReady(matchId, sheets);
      const snapshots = (await Promise.all(sheets.map((s) => this.dependencies.matchSheetPhotoSnapshotsRepository!.listByMatchSheet(s.id)))).flat();
      const decisions = await this.dependencies.recognitionsRepository.listByMatch(matchId);
      if (snapshots.some((snapshot) => !decisions.some((decision) => decision.registrationId === snapshot.registrationId && decision.snapshotId === snapshot.id))) {
        throw new Error('Every participant must have a saved recognition decision before completion.');
      }
    }

    return this.transitionRecognitionWorkflow(matchId, workflow.status, 'locked');
  }

  private async assertMatchSheetsLocked(matchId: UUID): Promise<readonly { readonly id: UUID; readonly status: string }[]> {
    const matchSheets = await this.dependencies.matchSheetsRepository.listByMatch(matchId);
    if (this.dependencies.matchesRepository) {
      const match = await this.dependencies.matchesRepository.findById(matchId);
      if (!match || match.status === 'cancelled') throw new MatchSheetsNotLockedError(matchId);
      const clubs = new Set(matchSheets.map((sheet) => sheet.clubId));
      if (matchSheets.length !== 2 || clubs.size !== 2 || !clubs.has(match.homeClubId) || !clubs.has(match.awayClubId)) throw new MatchSheetsNotLockedError(matchId);
    }
    if (matchSheets.length === 0) throw new MatchSheetsNotLockedError(matchId);
    const hasUnlockedMatchSheet = matchSheets.some((matchSheet) => matchSheet.status !== 'locked');

    if (hasUnlockedMatchSheet) {
      throw new MatchSheetsNotLockedError(matchId);
    }
    return matchSheets;
  }

  private async assertPhotoManifestReady(
    matchId: UUID,
    matchSheets: readonly { readonly id: UUID }[],
  ): Promise<void> {
    if (this.dependencies.matchSheetPhotoSnapshotsRepository === undefined) return;
    const {
      matchSheetPhotoSnapshotsRepository,
      matchSheetPlayersRepository,
      matchSheetStaffRepository,
    } = this.dependencies;
    if (matchSheetPlayersRepository && matchSheetStaffRepository) {
      for (const sheet of matchSheets) {
        const expected = [
          ...(await matchSheetPlayersRepository.listByMatchSheet(sheet.id)).map((p) => p.playerRegistrationId),
          ...(await matchSheetStaffRepository.listByMatchSheet(sheet.id)).map((p) => p.staffRegistrationId),
        ];
        const snapshots = await matchSheetPhotoSnapshotsRepository.listByMatchSheet(sheet.id);
        const actual = new Set(snapshots.map((row) => row.registrationId));
        if (!expected.length || snapshots.length !== expected.length || actual.size !== expected.length || snapshots.some((row) => row.matchId !== matchId) || expected.some((id) => !actual.has(id))) throw new MatchPhotoManifestNotReadyError(matchId);
      }
    }
    const snapshotRows = (
      await Promise.all(
        matchSheets.map((sheet) =>
          matchSheetPhotoSnapshotsRepository.listByMatchSheet(sheet.id),
        ),
      )
    ).flat();
    if (snapshotRows.length === 0) {
      throw new MatchPhotoManifestNotReadyError(matchId);
    }
    if (
      matchSheetPlayersRepository === undefined ||
      matchSheetStaffRepository === undefined
    ) {
      return;
    }
    const expectedRegistrationIds = new Set(
      (
        await Promise.all(
          matchSheets.map(async (sheet) => [
            ...(await matchSheetPlayersRepository.listByMatchSheet(sheet.id)).map(
              (player) => player.playerRegistrationId,
            ),
            ...(await matchSheetStaffRepository.listByMatchSheet(sheet.id)).map(
              (staffMember) => staffMember.staffRegistrationId,
            ),
          ]),
        )
      ).flat(),
    );
    const snapshotRegistrationIds = new Set(
      snapshotRows.map((snapshot) => snapshot.registrationId),
    );
    if (
      expectedRegistrationIds.size === 0 ||
      [...expectedRegistrationIds].some(
        (registrationId) => !snapshotRegistrationIds.has(registrationId),
      )
    ) {
      throw new MatchPhotoManifestNotReadyError(matchId);
    }
  }

  private transitionRecognitionWorkflow(
    matchId: UUID,
    currentStatus: RecognitionWorkflowStatus,
    nextStatus: RecognitionWorkflowStatus,
  ): Promise<RecognitionWorkflow> {
    if (!allowedRecognitionWorkflowTransitions[currentStatus].includes(nextStatus)) {
      throw new InvalidRecognitionWorkflowTransitionError(currentStatus, nextStatus);
    }

    return this.dependencies.recognitionsRepository.updateWorkflowStatus(matchId, nextStatus);
  }

  async recordDecision(matchId: UUID, registrationId: UUID, status: 'recognized' | 'rejected' | 'pending', notes: string | null, actorId: UUID): Promise<Recognition | null> {
    const workflow = await this.dependencies.recognitionsRepository.getWorkflowByMatch(matchId);
    if (workflow.status !== 'in_progress') throw new CompletedRecognitionError(matchId);
    const sheets = await this.assertMatchSheetsLocked(matchId);
    await this.assertPhotoManifestReady(matchId, sheets);
    const snapshots = (await Promise.all(sheets.map((s) => this.dependencies.matchSheetPhotoSnapshotsRepository!.listByMatchSheet(s.id)))).flat();
    const snapshot = snapshots.find((row) => row.registrationId === registrationId);
    if (!snapshot) throw new MatchPhotoManifestNotReadyError(matchId);
    if (status === 'pending') {
      if (!this.dependencies.recognitionsRepository.clearDecision) throw new Error('Recognition decision storage is required.');
      await this.dependencies.recognitionsRepository.clearDecision(matchId, registrationId);
      return null;
    }
    const unavailable = snapshot.photoStatus !== 'active' || (this.dependencies.photosService && (!snapshot.photoVersionId || !await this.dependencies.photosService.versionContentAvailable(snapshot.photoVersionId)));
    if ((status === 'rejected' || unavailable) && !notes?.trim()) throw new Error('A reason is required for rejection or recognition without an available active photo.');
    const match = await this.dependencies.matchesRepository?.findById(matchId);
    const players = await this.dependencies.matchSheetPlayersRepository!.listByMatchSheet(snapshot.matchSheetId);
    const staff = await this.dependencies.matchSheetStaffRepository!.listByMatchSheet(snapshot.matchSheetId);
    if (!this.dependencies.recognitionsRepository.saveDecision) throw new Error('Recognition decision storage is required.');
    return this.dependencies.recognitionsRepository.saveDecision({
      matchId, registrationId, snapshotId: snapshot.id, actorId,
      refereeId: match?.refereeId ?? actorId,
      matchSheetPlayerId: players.find((p) => p.playerRegistrationId === registrationId)?.id ?? null,
      matchSheetStaffId: staff.find((p) => p.staffRegistrationId === registrationId)?.id ?? null,
      status, notes, recognizedAt: new Date().toISOString(),
    });
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
