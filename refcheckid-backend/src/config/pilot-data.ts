import type { Match, MatchReport, MatchSheet, UUID } from '../domain/index.js';

export const pilotIds = {
  awayClub: '70000000-0000-4000-8000-000000000004',
  awaySheet: '70000000-0000-4000-8000-000000000008',
  federation: '70000000-0000-4000-8000-000000000002',
  homeClub: '70000000-0000-4000-8000-000000000003',
  homeSheet: '70000000-0000-4000-8000-000000000007',
  match: '70000000-0000-4000-8000-000000000006',
  report: '70000000-0000-4000-8000-000000000009',
  referee: '70000000-0000-4000-8000-000000000005',
} as const satisfies Record<string, UUID>;

const timestamp = '2026-07-01T00:00:00.000Z';

export const pilotMatches: readonly Match[] = [
  {
    awayClubId: pilotIds.awayClub,
    createdAt: timestamp,
    deletedAt: null,
    federationId: pilotIds.federation,
    homeClubId: pilotIds.homeClub,
    id: pilotIds.match,
    refereeId: pilotIds.referee,
    scheduledAt: '2026-07-01T18:00:00.000Z',
    season: '2026',
    status: 'scheduled',
    updatedAt: timestamp,
    venue: 'QA Stadium',
  },
];

export const pilotMatchSheets: readonly MatchSheet[] = [
  {
    clubId: pilotIds.homeClub,
    createdAt: timestamp,
    deletedAt: null,
    id: pilotIds.homeSheet,
    matchId: pilotIds.match,
    status: 'draft',
    submittedAt: null,
    updatedAt: timestamp,
  },
  {
    clubId: pilotIds.awayClub,
    createdAt: timestamp,
    deletedAt: null,
    id: pilotIds.awaySheet,
    matchId: pilotIds.match,
    status: 'draft',
    submittedAt: null,
    updatedAt: timestamp,
  },
];

export const pilotMatchReports: readonly MatchReport[] = [
  {
    createdAt: timestamp,
    deletedAt: null,
    id: pilotIds.report,
    matchId: pilotIds.match,
    refereeId: pilotIds.referee,
    status: 'draft',
    submittedAt: null,
    summary: null,
    updatedAt: timestamp,
  },
];
