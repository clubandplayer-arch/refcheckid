import type {
  Recognition,
  RecognitionWorkflow,
  RecognitionWorkflowStatus,
  UUID,
} from '../domain/index.js';
import type { EventPublisher } from '../events/index.js';
import type { MatchSheetRepositoryPort, RecognitionRepositoryPort } from '../repositories/index.js';

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
  readonly eventPublisher?: EventPublisher;
  readonly matchSheetsRepository: MatchSheetRepositoryPort;
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

  async startRecognition(matchId: UUID): Promise<RecognitionWorkflow> {
    await this.assertMatchSheetsLocked(matchId);

    const workflow = await this.dependencies.recognitionsRepository.getWorkflowByMatch(matchId);

    if (workflow.status === 'in_progress') {
      return workflow;
    }

    if (workflow.status === 'locked') {
      throw new CompletedRecognitionError(matchId);
    }

    return this.transitionRecognitionWorkflow(matchId, workflow.status, 'in_progress');
  }

  async completeRecognition(matchId: UUID): Promise<RecognitionWorkflow> {
    const workflow = await this.dependencies.recognitionsRepository.getWorkflowByMatch(matchId);

    if (workflow.status === 'locked') {
      return workflow;
    }

    return this.transitionRecognitionWorkflow(matchId, workflow.status, 'locked');
  }

  private async assertMatchSheetsLocked(matchId: UUID): Promise<void> {
    const matchSheets = await this.dependencies.matchSheetsRepository.listByMatch(matchId);
    const hasUnlockedMatchSheet = matchSheets.some((matchSheet) => matchSheet.status !== 'locked');

    if (hasUnlockedMatchSheet) {
      throw new MatchSheetsNotLockedError(matchId);
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

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
