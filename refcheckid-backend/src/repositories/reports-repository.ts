import type { MatchReport, MatchReportStatus, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export interface CreateMatchReportInput {
  matchId: UUID;
  refereeId: UUID;
  summary: string | null;
}

export interface UpdateMatchReportInput {
  summary: string | null;
}

export interface MatchReportRepositoryPort {
  findById(id: UUID): Promise<MatchReport | null>;
  findByMatch(matchId: UUID): Promise<MatchReport | null>;
  create(input: CreateMatchReportInput): Promise<MatchReport>;
  updateContent(id: UUID, input: UpdateMatchReportInput): Promise<MatchReport>;
  updateStatus(id: UUID, status: MatchReportStatus): Promise<MatchReport>;
  resetByMatch?(matchId: UUID): Promise<void>;
}

export class MatchReportRepository
  extends DrizzleRepository<MatchReport, CreateMatchReportInput, Partial<MatchReport>>
  implements MatchReportRepositoryPort
{
  constructor(initialRows: readonly MatchReport[] = []) {
    super({ tableName: 'match_reports', initialRows });
  }

  async findByMatch(matchId: UUID): Promise<MatchReport | null> {
    return Promise.resolve(
      [...(await this.values())].reverse().find((report) => report.matchId === matchId && report.deletedAt === null) ?? null,
    );
  }

  async resetByMatch(matchId: UUID): Promise<void> {
    for (const row of (await this.values()).filter((report) => report.matchId === matchId && report.deletedAt === null)) {
      await this.update(row.id, { deletedAt: new Date().toISOString() });
    }
  }

  override async findById(id: UUID): Promise<MatchReport | null> {
    const report = await super.findById(id);
    return report?.deletedAt === null ? report : null;
  }

  async create(input: CreateMatchReportInput): Promise<MatchReport> {
    return super.create({ ...input, status: 'draft', submittedAt: null } as CreateMatchReportInput);
  }

  async updateContent(id: UUID, input: UpdateMatchReportInput): Promise<MatchReport> {
    return this.update(id, input);
  }

  async updateStatus(id: UUID, status: MatchReportStatus): Promise<MatchReport> {
    const submittedAt = status === 'submitted' ? new Date().toISOString() : undefined;
    return this.update(id, {
      status,
      ...(submittedAt === undefined ? {} : { submittedAt }),
    } as Partial<MatchReport>);
  }
}

export class ReportsRepository extends MatchReportRepository {}

export class ReportDraftRepository extends DrizzleRepository<{
  id: UUID; createdAt: string; updatedAt?: string; deletedAt: string | null; matchId: UUID; summary: string;
}> {
  constructor() { super({ tableName: 'report_drafts' }); }
}
