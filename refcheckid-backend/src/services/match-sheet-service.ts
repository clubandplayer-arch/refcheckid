import type { MatchSheet, MatchSheetStatus, UUID } from '../domain/index.js';
import type { EventPublisher } from '../events/index.js';
import type { MatchSheetRepositoryPort } from '../repositories/index.js';

const allowedMatchSheetStatusTransitions: Readonly<
  Record<MatchSheetStatus, readonly MatchSheetStatus[]>
> = {
  draft: ['submitted', 'locked'],
  submitted: ['locked'],
  locked: [],
};

export class MatchSheetNotFoundError extends Error {
  constructor(matchSheetId: UUID) {
    super(`Match sheet ${matchSheetId} was not found.`);
    this.name = 'MatchSheetNotFoundError';
  }
}

export class InvalidMatchSheetStatusTransitionError extends Error {
  constructor(from: MatchSheetStatus, to: MatchSheetStatus) {
    super(`Invalid match sheet status transition from ${from} to ${to}.`);
    this.name = 'InvalidMatchSheetStatusTransitionError';
  }
}

export class LockedMatchSheetError extends Error {
  constructor(matchSheetId: UUID) {
    super(`Match sheet ${matchSheetId} is locked and cannot be modified.`);
    this.name = 'LockedMatchSheetError';
  }
}

export interface MatchSheetServiceDependencies {
  readonly eventPublisher?: EventPublisher;
  readonly matchSheetsRepository: MatchSheetRepositoryPort;
}

export class MatchSheetService {
  constructor(private readonly dependencies: MatchSheetServiceDependencies) {}

  getMatchSheetById(matchSheetId: UUID): Promise<MatchSheet | null> {
    return this.dependencies.matchSheetsRepository.findById(matchSheetId);
  }

  listMatchSheetsByMatch(matchId: UUID): Promise<readonly MatchSheet[]> {
    return this.dependencies.matchSheetsRepository.listByMatch(matchId);
  }

  listMatchSheetsByClub(clubId: UUID): Promise<readonly MatchSheet[]> {
    return this.dependencies.matchSheetsRepository.listByClub(clubId);
  }

  submitMatchSheet(matchSheetId: UUID): Promise<MatchSheet> {
    return this.transitionMatchSheetStatus(matchSheetId, 'submitted');
  }

  lockMatchSheet(matchSheetId: UUID): Promise<MatchSheet> {
    return this.transitionMatchSheetStatus(matchSheetId, 'locked');
  }

  async resetSmokeMatchSheet(matchSheetId: UUID): Promise<MatchSheet> {
    if (process.env.NODE_ENV === 'production' && process.env.REFCHECKID_SMOKE_RESET !== 'true') {
      throw new Error('Smoke reset is available only in dev/smoke environments.');
    }
    const matchSheet = await this.dependencies.matchSheetsRepository.findById(matchSheetId);
    if (matchSheet === null) {
      throw new MatchSheetNotFoundError(matchSheetId);
    }
    return this.dependencies.matchSheetsRepository.updateStatus(matchSheetId, 'draft');
  }

  private async transitionMatchSheetStatus(
    matchSheetId: UUID,
    nextStatus: MatchSheetStatus,
  ): Promise<MatchSheet> {
    const matchSheet = await this.dependencies.matchSheetsRepository.findById(matchSheetId);

    if (matchSheet === null) {
      throw new MatchSheetNotFoundError(matchSheetId);
    }

    if (matchSheet.status === nextStatus) {
      return matchSheet;
    }

    if (matchSheet.status === 'locked') {
      throw new LockedMatchSheetError(matchSheetId);
    }

    if (!allowedMatchSheetStatusTransitions[matchSheet.status].includes(nextStatus)) {
      throw new InvalidMatchSheetStatusTransitionError(matchSheet.status, nextStatus);
    }

    return this.dependencies.matchSheetsRepository.updateStatus(matchSheetId, nextStatus);
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
