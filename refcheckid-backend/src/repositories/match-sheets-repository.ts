import type { MatchSheet, MatchSheetStatus, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export interface MatchSheetRepositoryPort {
  findById(id: UUID): Promise<MatchSheet | null>;
  listByMatch(matchId: UUID): Promise<readonly MatchSheet[]>;
  listByClub(clubId: UUID): Promise<readonly MatchSheet[]>;
  updateStatus(id: UUID, status: MatchSheetStatus): Promise<MatchSheet>;
}

export class MatchSheetRepository
  extends DrizzleRepository<MatchSheet>
  implements MatchSheetRepositoryPort
{
  constructor(initialRows: readonly MatchSheet[] = []) {
    super({ tableName: 'match_sheets', initialRows });
  }

  listByMatch(matchId: UUID): Promise<readonly MatchSheet[]> {
    return Promise.resolve(this.values().filter((matchSheet) => matchSheet.matchId === matchId));
  }

  listByClub(clubId: UUID): Promise<readonly MatchSheet[]> {
    return Promise.resolve(this.values().filter((matchSheet) => matchSheet.clubId === clubId));
  }

  async updateStatus(id: UUID, status: MatchSheetStatus): Promise<MatchSheet> {
    const existing = await this.findById(id);
    const submittedAt =
      status === 'submitted' || status === 'locked'
        ? existing?.submittedAt ?? new Date().toISOString()
        : null;
    return this.update(id, { status, submittedAt } as Partial<MatchSheet>);
  }

  resetSmokeDraft(id: UUID): Promise<MatchSheet> {
    return this.update(id, { status: 'draft', submittedAt: null } as Partial<MatchSheet>);
  }
}

export class MatchSheetsRepository extends MatchSheetRepository {}
