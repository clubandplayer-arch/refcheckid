import type { Match, MatchStatus, UUID } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export interface MatchRepositoryPort {
  findById(id: UUID): Promise<Match | null>;
  listByFederation(federationId: UUID): Promise<readonly Match[]>;
  listByClub(clubId: UUID): Promise<readonly Match[]>;
  listByReferee(refereeId: UUID): Promise<readonly Match[]>;
  updateStatus(id: UUID, status: MatchStatus): Promise<Match>;
}

export class MatchesRepository extends NotImplementedRepository<Match> implements MatchRepositoryPort {
  constructor() {
    super('MatchesRepository');
  }

  listByFederation(): Promise<readonly Match[]> {
    return Promise.reject(new Error('MatchesRepository.listByFederation is not implemented yet.'));
  }

  listByClub(): Promise<readonly Match[]> {
    return Promise.reject(new Error('MatchesRepository.listByClub is not implemented yet.'));
  }

  listByReferee(): Promise<readonly Match[]> {
    return Promise.reject(new Error('MatchesRepository.listByReferee is not implemented yet.'));
  }

  updateStatus(): Promise<Match> {
    return Promise.reject(new Error('MatchesRepository.updateStatus is not implemented yet.'));
  }
}
