import type { MatchReport, MatchReportStatus, UUID } from '../domain/index.js';
import { PersistentRuntimeRepository } from './runtime-state-repository.js';

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
  extends PersistentRuntimeRepository<MatchReport, CreateMatchReportInput, Partial<MatchReport>>
  implements MatchReportRepositoryPort
{
  constructor(initialRows: readonly MatchReport[] = [], persistenceRoot?: string | null) {
    super('match_reports', 'match-reports.json', initialRows, persistenceRoot);
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
