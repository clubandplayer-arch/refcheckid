import type { Match, MatchStatus, UUID } from '../domain/index.js';
import { PersistentRuntimeRepository } from './runtime-state-repository.js';

export interface MatchRepositoryPort {
  findById(id: UUID): Promise<Match | null>;
  listByFederation(federationId: UUID): Promise<readonly Match[]>;
  listByClub(clubId: UUID): Promise<readonly Match[]>;
  listByReferee(refereeId: UUID): Promise<readonly Match[]>;
  updateStatus(id: UUID, status: MatchStatus): Promise<Match>;
}

export class MatchRepository
  extends PersistentRuntimeRepository<Match>
  implements MatchRepositoryPort
{
  constructor(initialRows: readonly Match[] = [], persistenceRoot?: string | null) {
    super('matches', 'matches.json', initialRows, persistenceRoot);
  }

  listByFederation(federationId: UUID): Promise<readonly Match[]> {
    return Promise.resolve(this.values().filter((match) => match.federationId === federationId));
  }

  listByClub(clubId: UUID): Promise<readonly Match[]> {
    return Promise.resolve(
      this.values().filter((match) => match.homeClubId === clubId || match.awayClubId === clubId),
    );
  }

  listByReferee(refereeId: UUID): Promise<readonly Match[]> {
    return Promise.resolve(this.values().filter((match) => match.refereeId === refereeId));
  }

  updateStatus(id: UUID, status: MatchStatus): Promise<Match> {
    return this.update(id, { status } as Partial<Match>);
  }
}

export class MatchesRepository extends MatchRepository {}
