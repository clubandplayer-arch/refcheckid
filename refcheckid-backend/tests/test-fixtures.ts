import type { Match, MatchSheet, UUID } from '../src/domain/index.js';

export const ids = {
  actor: '70000000-0000-4000-8000-000000000001',
  federation: '70000000-0000-4000-8000-000000000002',
  homeClub: '70000000-0000-4000-8000-000000000003',
  awayClub: '70000000-0000-4000-8000-000000000004',
  referee: '70000000-0000-4000-8000-000000000005',
  match: '70000000-0000-4000-8000-000000000006',
  homeSheet: '70000000-0000-4000-8000-000000000007',
  awaySheet: '70000000-0000-4000-8000-000000000008',
} as const satisfies Record<string, UUID>;

export function match(overrides: Partial<Match> = {}): Match {
  return {
    id: ids.match,
    federationId: ids.federation,
    homeClubId: ids.homeClub,
    awayClubId: ids.awayClub,
    refereeId: ids.referee,
    season: '2026',
    scheduledAt: '2026-07-01T18:00:00.000Z',
    venue: 'QA Stadium',
    status: 'scheduled',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

export function matchSheet(id: UUID, clubId: UUID, overrides: Partial<MatchSheet> = {}): MatchSheet {
  return {
    id,
    matchId: ids.match,
    clubId,
    submittedAt: null,
    status: 'draft',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

export const authHeaders = { 'x-actor-id': ids.actor, 'x-roles': 'manager,referee,federation' };
