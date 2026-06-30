import type { MatchReport, MatchReportStatus, UUID } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

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

export class ReportsRepository
  extends NotImplementedRepository<MatchReport, CreateMatchReportInput, UpdateMatchReportInput>
  implements MatchReportRepositoryPort
{
  constructor() {
    super('ReportsRepository');
  }

  findByMatch(): Promise<MatchReport | null> {
    return Promise.reject(new Error('ReportsRepository.findByMatch is not implemented yet.'));
  }

  updateContent(): Promise<MatchReport> {
    return Promise.reject(new Error('ReportsRepository.updateContent is not implemented yet.'));
  }

  updateStatus(): Promise<MatchReport> {
    return Promise.reject(new Error('ReportsRepository.updateStatus is not implemented yet.'));
  }
}
