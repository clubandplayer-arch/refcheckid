import type { MatchSheet, MatchSheetStatus, UUID } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export interface MatchSheetRepositoryPort {
  findById(id: UUID): Promise<MatchSheet | null>;
  listByMatch(matchId: UUID): Promise<readonly MatchSheet[]>;
  listByClub(clubId: UUID): Promise<readonly MatchSheet[]>;
  updateStatus(id: UUID, status: MatchSheetStatus): Promise<MatchSheet>;
}

export class MatchSheetsRepository
  extends NotImplementedRepository<MatchSheet>
  implements MatchSheetRepositoryPort
{
  constructor() {
    super('MatchSheetsRepository');
  }

  listByMatch(): Promise<readonly MatchSheet[]> {
    return Promise.reject(new Error('MatchSheetsRepository.listByMatch is not implemented yet.'));
  }

  listByClub(): Promise<readonly MatchSheet[]> {
    return Promise.reject(new Error('MatchSheetsRepository.listByClub is not implemented yet.'));
  }

  updateStatus(): Promise<MatchSheet> {
    return Promise.reject(new Error('MatchSheetsRepository.updateStatus is not implemented yet.'));
  }
}
