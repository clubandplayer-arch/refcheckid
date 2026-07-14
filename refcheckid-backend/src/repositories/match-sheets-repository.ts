import type { MatchSheet, MatchSheetPlayer, MatchSheetStaff, MatchSheetStatus, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export interface MatchSheetRepositoryPort {
  findById(id: UUID): Promise<MatchSheet | null>;
  listByMatch(matchId: UUID): Promise<readonly MatchSheet[]>;
  listByClub(clubId: UUID): Promise<readonly MatchSheet[]>;
  updateStatus(id: UUID, status: MatchSheetStatus): Promise<MatchSheet>;
}

export interface MatchSheetPlayerRepositoryPort {
  replaceByMatchSheet(
    matchSheetId: UUID,
    players: readonly Omit<MatchSheetPlayer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[],
  ): Promise<readonly MatchSheetPlayer[]>;
  listByMatchSheet(matchSheetId: UUID): Promise<readonly MatchSheetPlayer[]>;
}

export interface MatchSheetStaffRepositoryPort {
  replaceByMatchSheet(
    matchSheetId: UUID,
    staff: readonly Omit<MatchSheetStaff, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[],
  ): Promise<readonly MatchSheetStaff[]>;
  listByMatchSheet(matchSheetId: UUID): Promise<readonly MatchSheetStaff[]>;
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

export class MatchSheetPlayerRepository
  extends DrizzleRepository<MatchSheetPlayer>
  implements MatchSheetPlayerRepositoryPort
{
  constructor(initialRows: readonly MatchSheetPlayer[] = []) {
    super({ tableName: 'match_sheet_players', initialRows });
  }

  async replaceByMatchSheet(
    matchSheetId: UUID,
    players: readonly Omit<MatchSheetPlayer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[],
  ): Promise<readonly MatchSheetPlayer[]> {
    const existing = this.values().filter((player) => player.matchSheetId === matchSheetId);
    await Promise.all(
      existing.map((player) =>
        this.update(player.id, { deletedAt: new Date().toISOString() } as Partial<MatchSheetPlayer>),
      ),
    );
    return Promise.all(players.map((player) => this.create(player)));
  }

  listByMatchSheet(matchSheetId: UUID): Promise<readonly MatchSheetPlayer[]> {
    return Promise.resolve(
      this.values().filter((player) => player.matchSheetId === matchSheetId && player.deletedAt === null),
    );
  }
}

export class MatchSheetStaffRepository
  extends DrizzleRepository<MatchSheetStaff>
  implements MatchSheetStaffRepositoryPort
{
  constructor(initialRows: readonly MatchSheetStaff[] = []) {
    super({ tableName: 'match_sheet_staff', initialRows });
  }

  async replaceByMatchSheet(
    matchSheetId: UUID,
    staff: readonly Omit<MatchSheetStaff, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[],
  ): Promise<readonly MatchSheetStaff[]> {
    const existing = this.values().filter((staffMember) => staffMember.matchSheetId === matchSheetId);
    await Promise.all(
      existing.map((staffMember) =>
        this.update(staffMember.id, { deletedAt: new Date().toISOString() } as Partial<MatchSheetStaff>),
      ),
    );
    return Promise.all(staff.map((staffMember) => this.create(staffMember)));
  }

  listByMatchSheet(matchSheetId: UUID): Promise<readonly MatchSheetStaff[]> {
    return Promise.resolve(
      this.values().filter((staffMember) => staffMember.matchSheetId === matchSheetId && staffMember.deletedAt === null),
    );
  }
}
