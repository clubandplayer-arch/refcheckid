import type { MatchReport, MatchReportStatus, UUID } from '../domain/index.js';
import type { EventPublisher } from '../events/index.js';
import type { MatchRepositoryPort, MatchReportRepositoryPort } from '../repositories/index.js';

const editableMatchReportStatuses: readonly MatchReportStatus[] = ['draft', 'in_compilation'];
const allowedMatchReportSubmitTransitions: readonly MatchReportStatus[] = [
  'draft',
  'in_compilation',
];

export interface CreateMatchReportCommand {
  readonly matchId: UUID;
  readonly refereeId: UUID;
  readonly summary?: string | null;
}

export interface UpdateMatchReportCommand {
  readonly summary?: string | null;
}

export class MatchReportNotFoundError extends Error {
  constructor(matchReportId: UUID) {
    super(`Match report ${matchReportId} was not found.`);
    this.name = 'MatchReportNotFoundError';
  }
}

export class MatchReportMatchNotFoundError extends Error {
  constructor(matchId: UUID) {
    super(`Match ${matchId} was not found for match report creation.`);
    this.name = 'MatchReportMatchNotFoundError';
  }
}

export class MatchReportMatchNotCompletedError extends Error {
  constructor(matchId: UUID) {
    super(`Match report for match ${matchId} can be created only after the match is completed.`);
    this.name = 'MatchReportMatchNotCompletedError';
  }
}

export class SubmittedMatchReportError extends Error {
  constructor(matchReportId: UUID) {
    super(`Match report ${matchReportId} is submitted and cannot be modified.`);
    this.name = 'SubmittedMatchReportError';
  }
}

export class InvalidMatchReportStatusTransitionError extends Error {
  constructor(from: MatchReportStatus, to: MatchReportStatus) {
    super(`Invalid match report status transition from ${from} to ${to}.`);
    this.name = 'InvalidMatchReportStatusTransitionError';
  }
}

export interface MatchReportServiceDependencies {
  readonly eventPublisher?: EventPublisher;
  readonly matchesRepository: MatchRepositoryPort;
  readonly reportsRepository: MatchReportRepositoryPort;
}

export class MatchReportService {
  constructor(private readonly dependencies: MatchReportServiceDependencies) {}

  getMatchReportById(matchReportId: UUID): Promise<MatchReport | null> {
    return this.dependencies.reportsRepository.findById(matchReportId);
  }

  getMatchReportByMatch(matchId: UUID): Promise<MatchReport | null> {
    return this.dependencies.reportsRepository.findByMatch(matchId);
  }

  async createMatchReport(command: CreateMatchReportCommand): Promise<MatchReport> {
    const match = await this.dependencies.matchesRepository.findById(command.matchId);

    if (match === null) {
      throw new MatchReportMatchNotFoundError(command.matchId);
    }

    if (match.status !== 'completed') {
      throw new MatchReportMatchNotCompletedError(command.matchId);
    }

    return this.dependencies.reportsRepository.create({
      matchId: command.matchId,
      refereeId: command.refereeId,
      summary: command.summary ?? null,
    });
  }

  async updateMatchReport(
    matchReportId: UUID,
    command: UpdateMatchReportCommand,
  ): Promise<MatchReport> {
    const matchReport = await this.getExistingMatchReport(matchReportId);
    this.assertMatchReportEditable(matchReport);

    return this.dependencies.reportsRepository.updateContent(matchReportId, {
      summary: command.summary ?? matchReport.summary,
    });
  }

  async submitMatchReport(matchReportId: UUID): Promise<MatchReport> {
    const matchReport = await this.getExistingMatchReport(matchReportId);

    if (matchReport.status === 'submitted') {
      throw new SubmittedMatchReportError(matchReportId);
    }

    if (!allowedMatchReportSubmitTransitions.includes(matchReport.status)) {
      throw new InvalidMatchReportStatusTransitionError(matchReport.status, 'submitted');
    }

    return this.dependencies.reportsRepository.updateStatus(matchReportId, 'submitted');
  }

  private async getExistingMatchReport(matchReportId: UUID): Promise<MatchReport> {
    const matchReport = await this.dependencies.reportsRepository.findById(matchReportId);

    if (matchReport === null) {
      throw new MatchReportNotFoundError(matchReportId);
    }

    return matchReport;
  }

  private assertMatchReportEditable(matchReport: MatchReport): void {
    if (matchReport.status === 'submitted') {
      throw new SubmittedMatchReportError(matchReport.id);
    }

    if (!editableMatchReportStatuses.includes(matchReport.status)) {
      throw new InvalidMatchReportStatusTransitionError(matchReport.status, matchReport.status);
    }
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
