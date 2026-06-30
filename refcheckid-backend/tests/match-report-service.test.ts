import { describe, expect, it } from 'vitest';
import type {
  Match,
  MatchReport,
  MatchReportStatus,
  MatchStatus,
  UUID,
} from '../src/domain/index.js';
import type { MatchRepositoryPort, MatchReportRepositoryPort } from '../src/repositories/index.js';
import {
  InvalidMatchReportStatusTransitionError,
  MatchReportMatchNotCompletedError,
  MatchReportMatchNotFoundError,
  MatchReportNotFoundError,
  MatchReportService,
  SubmittedMatchReportError,
} from '../src/services/index.js';

const matchReportId = '30000000-0000-0000-0000-000000000001';
const matchId = '30000000-0000-0000-0000-000000000002';
const federationId = '30000000-0000-0000-0000-000000000003';
const homeClubId = '30000000-0000-0000-0000-000000000004';
const awayClubId = '30000000-0000-0000-0000-000000000005';
const refereeId = '30000000-0000-0000-0000-000000000006';

function buildMatch(status: MatchStatus = 'completed'): Match {
  return {
    id: matchId,
    federationId,
    homeClubId,
    awayClubId,
    refereeId,
    season: '2026',
    scheduledAt: '2026-06-30T12:00:00.000Z',
    venue: 'Main Field',
    status,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    deletedAt: null,
  };
}

function buildMatchReport(status: MatchReportStatus = 'draft'): MatchReport {
  return {
    id: matchReportId,
    matchId,
    refereeId,
    submittedAt: status === 'submitted' ? '2026-06-30T14:00:00.000Z' : null,
    status,
    summary: 'Initial summary',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    deletedAt: null,
  };
}

class FakeMatchRepository implements MatchRepositoryPort {
  constructor(private readonly matches: readonly Match[] = []) {}

  findById(id: UUID): Promise<Match | null> {
    return Promise.resolve(this.matches.find((match) => match.id === id) ?? null);
  }

  listByFederation(): Promise<readonly Match[]> {
    return Promise.resolve([]);
  }

  listByClub(): Promise<readonly Match[]> {
    return Promise.resolve([]);
  }

  listByReferee(): Promise<readonly Match[]> {
    return Promise.resolve([]);
  }

  updateStatus(): Promise<Match> {
    return Promise.reject(new Error('FakeMatchRepository.updateStatus is not implemented.'));
  }
}

class FakeMatchReportRepository implements MatchReportRepositoryPort {
  readonly reports = new Map<UUID, MatchReport>();
  readonly createInputs: Array<{ matchId: UUID; refereeId: UUID; summary: string | null }> = [];
  readonly contentUpdates: Array<{ id: UUID; summary: string | null }> = [];
  readonly statusUpdates: Array<{ id: UUID; status: MatchReportStatus }> = [];

  constructor(initialReports: readonly MatchReport[] = []) {
    for (const report of initialReports) {
      this.reports.set(report.id, report);
    }
  }

  findById(id: UUID): Promise<MatchReport | null> {
    return Promise.resolve(this.reports.get(id) ?? null);
  }

  findByMatch(targetMatchId: UUID): Promise<MatchReport | null> {
    return Promise.resolve(
      [...this.reports.values()].find((report) => report.matchId === targetMatchId) ?? null,
    );
  }

  create(input: { matchId: UUID; refereeId: UUID; summary: string | null }): Promise<MatchReport> {
    this.createInputs.push(input);

    const report: MatchReport = {
      id: matchReportId,
      matchId: input.matchId,
      refereeId: input.refereeId,
      submittedAt: null,
      status: 'draft',
      summary: input.summary,
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
      deletedAt: null,
    };
    this.reports.set(report.id, report);

    return Promise.resolve(report);
  }

  updateContent(id: UUID, input: { summary: string | null }): Promise<MatchReport> {
    const report = this.reports.get(id);

    if (report === undefined) {
      throw new MatchReportNotFoundError(id);
    }

    const updatedReport = { ...report, summary: input.summary };
    this.reports.set(id, updatedReport);
    this.contentUpdates.push({ id, summary: input.summary });

    return Promise.resolve(updatedReport);
  }

  updateStatus(id: UUID, status: MatchReportStatus): Promise<MatchReport> {
    const report = this.reports.get(id);

    if (report === undefined) {
      throw new MatchReportNotFoundError(id);
    }

    const updatedReport = {
      ...report,
      status,
      submittedAt: status === 'submitted' ? '2026-06-30T14:00:00.000Z' : report.submittedAt,
    };
    this.reports.set(id, updatedReport);
    this.statusUpdates.push({ id, status });

    return Promise.resolve(updatedReport);
  }
}

describe('MatchReportService', () => {
  it('gets a match report by id', async () => {
    const report = buildMatchReport();
    const reportsRepository = new FakeMatchReportRepository([report]);
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository,
    });

    await expect(service.getMatchReportById(report.id)).resolves.toEqual(report);
  });

  it('gets a match report by match', async () => {
    const report = buildMatchReport();
    const reportsRepository = new FakeMatchReportRepository([report]);
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository,
    });

    await expect(service.getMatchReportByMatch(matchId)).resolves.toEqual(report);
  });

  it('creates a draft match report after the match is completed', async () => {
    const reportsRepository = new FakeMatchReportRepository();
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository([buildMatch('completed')]),
      reportsRepository,
    });

    await expect(
      service.createMatchReport({ matchId, refereeId, summary: 'Final summary' }),
    ).resolves.toMatchObject({ matchId, refereeId, status: 'draft', summary: 'Final summary' });
    expect(reportsRepository.createInputs).toEqual([
      { matchId, refereeId, summary: 'Final summary' },
    ]);
  });

  it('rejects report creation when the match does not exist', async () => {
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository: new FakeMatchReportRepository(),
    });

    await expect(service.createMatchReport({ matchId, refereeId })).rejects.toBeInstanceOf(
      MatchReportMatchNotFoundError,
    );
  });

  it('rejects report creation before the match is completed', async () => {
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository([buildMatch('in_progress')]),
      reportsRepository: new FakeMatchReportRepository(),
    });

    await expect(service.createMatchReport({ matchId, refereeId })).rejects.toBeInstanceOf(
      MatchReportMatchNotCompletedError,
    );
  });

  it('updates a draft match report', async () => {
    const report = buildMatchReport('draft');
    const reportsRepository = new FakeMatchReportRepository([report]);
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository,
    });

    await expect(
      service.updateMatchReport(report.id, { summary: 'Updated summary' }),
    ).resolves.toMatchObject({ id: report.id, summary: 'Updated summary' });
    expect(reportsRepository.contentUpdates).toEqual([
      { id: report.id, summary: 'Updated summary' },
    ]);
  });

  it('updates an in-compilation match report', async () => {
    const report = buildMatchReport('in_compilation');
    const reportsRepository = new FakeMatchReportRepository([report]);
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository,
    });

    await expect(
      service.updateMatchReport(report.id, { summary: 'Compilation update' }),
    ).resolves.toMatchObject({ id: report.id, summary: 'Compilation update' });
  });

  it('rejects updates after submission', async () => {
    const report = buildMatchReport('submitted');
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository: new FakeMatchReportRepository([report]),
    });

    await expect(
      service.updateMatchReport(report.id, { summary: 'Forbidden' }),
    ).rejects.toBeInstanceOf(SubmittedMatchReportError);
  });

  it('submits a draft match report', async () => {
    const report = buildMatchReport('draft');
    const reportsRepository = new FakeMatchReportRepository([report]);
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository,
    });

    await expect(service.submitMatchReport(report.id)).resolves.toMatchObject({
      id: report.id,
      status: 'submitted',
    });
    expect(reportsRepository.statusUpdates).toEqual([{ id: report.id, status: 'submitted' }]);
  });

  it('submits an in-compilation match report', async () => {
    const report = buildMatchReport('in_compilation');
    const reportsRepository = new FakeMatchReportRepository([report]);
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository,
    });

    await expect(service.submitMatchReport(report.id)).resolves.toMatchObject({
      id: report.id,
      status: 'submitted',
    });
  });

  it('rejects submitting an already submitted match report', async () => {
    const report = buildMatchReport('submitted');
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository: new FakeMatchReportRepository([report]),
    });

    await expect(service.submitMatchReport(report.id)).rejects.toBeInstanceOf(
      SubmittedMatchReportError,
    );
  });

  it('rejects invalid submit transitions', async () => {
    const report = buildMatchReport('locked');
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository: new FakeMatchReportRepository([report]),
    });

    await expect(service.submitMatchReport(report.id)).rejects.toBeInstanceOf(
      InvalidMatchReportStatusTransitionError,
    );
  });

  it('rejects updates for missing reports', async () => {
    const service = new MatchReportService({
      matchesRepository: new FakeMatchRepository(),
      reportsRepository: new FakeMatchReportRepository(),
    });

    await expect(
      service.updateMatchReport(matchReportId, { summary: 'Missing' }),
    ).rejects.toBeInstanceOf(MatchReportNotFoundError);
  });
});
