import type { Match, MatchStatus, UUID } from '../domain/index.js';
import type { EventPublisher } from '../events/index.js';
import type { MatchRepositoryPort } from '../repositories/index.js';

const allowedMatchStatusTransitions: Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class MatchNotFoundError extends Error {
  constructor(matchId: UUID) {
    super(`Match ${matchId} was not found.`);
    this.name = 'MatchNotFoundError';
  }
}

export class InvalidMatchStatusTransitionError extends Error {
  constructor(from: MatchStatus, to: MatchStatus) {
    super(`Invalid match status transition from ${from} to ${to}.`);
    this.name = 'InvalidMatchStatusTransitionError';
  }
}

export interface MatchServiceDependencies {
  readonly eventPublisher?: EventPublisher;
  readonly matchesRepository: MatchRepositoryPort;
}

export class MatchService {
  constructor(private readonly dependencies: MatchServiceDependencies) {}

  getMatchById(matchId: UUID): Promise<Match | null> {
    return this.dependencies.matchesRepository.findById(matchId);
  }

  listMatchesByFederation(federationId: UUID): Promise<readonly Match[]> {
    return this.dependencies.matchesRepository.listByFederation(federationId);
  }

  listMatchesByClub(clubId: UUID): Promise<readonly Match[]> {
    return this.dependencies.matchesRepository.listByClub(clubId);
  }

  listMatchesByReferee(refereeId: UUID): Promise<readonly Match[]> {
    return this.dependencies.matchesRepository.listByReferee(refereeId);
  }

  async transitionMatchStatus(matchId: UUID, nextStatus: MatchStatus): Promise<Match> {
    const match = await this.dependencies.matchesRepository.findById(matchId);

    if (match === null) {
      throw new MatchNotFoundError(matchId);
    }

    if (match.status === nextStatus) {
      return match;
    }

    if (!allowedMatchStatusTransitions[match.status].includes(nextStatus)) {
      throw new InvalidMatchStatusTransitionError(match.status, nextStatus);
    }

    return this.dependencies.matchesRepository.updateStatus(matchId, nextStatus);
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
