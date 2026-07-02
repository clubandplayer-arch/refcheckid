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
}

export class MatchReportRepository
  extends DrizzleRepository<MatchReport, CreateMatchReportInput, Partial<MatchReport>>
  implements MatchReportRepositoryPort
{
  constructor(initialRows: readonly MatchReport[] = []) {
    super({ tableName: 'match_reports', initialRows });
  }

  findByMatch(matchId: UUID): Promise<MatchReport | null> {
    return Promise.resolve(
      [...this.values()].reverse().find((report) => report.matchId === matchId) ?? null,
    );
  }

  create(input: CreateMatchReportInput): Promise<MatchReport> {
    return super.create({ ...input, status: 'draft', submittedAt: null } as CreateMatchReportInput);
  }

  updateContent(id: UUID, input: UpdateMatchReportInput): Promise<MatchReport> {
    return this.update(id, input);
  }

  updateStatus(id: UUID, status: MatchReportStatus): Promise<MatchReport> {
    const submittedAt = status === 'submitted' ? new Date().toISOString() : undefined;
    return this.update(id, {
      status,
      ...(submittedAt === undefined ? {} : { submittedAt }),
    } as Partial<MatchReport>);
  }
}

export class ReportsRepository extends MatchReportRepository {}
