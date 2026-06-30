import { describe, expect, it } from 'vitest';
import type { Match, MatchStatus, UUID } from '../src/domain/index.js';
import type { MatchRepositoryPort } from '../src/repositories/index.js';
import {
  InvalidMatchStatusTransitionError,
  MatchNotFoundError,
  MatchService,
} from '../src/services/index.js';

const matchId = '00000000-0000-0000-0000-000000000001';
const federationId = '00000000-0000-0000-0000-000000000002';
const homeClubId = '00000000-0000-0000-0000-000000000003';
const awayClubId = '00000000-0000-0000-0000-000000000004';
const refereeId = '00000000-0000-0000-0000-000000000005';

function buildMatch(status: MatchStatus = 'scheduled'): Match {
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

class FakeMatchRepository implements MatchRepositoryPort {
  readonly matches = new Map<UUID, Match>();
  readonly statusUpdates: Array<{ id: UUID; status: MatchStatus }> = [];

  constructor(initialMatches: readonly Match[] = []) {
    for (const match of initialMatches) {
      this.matches.set(match.id, match);
    }
  }

  findById(id: UUID): Promise<Match | null> {
    return Promise.resolve(this.matches.get(id) ?? null);
  }

  listByFederation(targetFederationId: UUID): Promise<readonly Match[]> {
    return Promise.resolve(
      [...this.matches.values()].filter((match) => match.federationId === targetFederationId),
    );
  }

  listByClub(clubId: UUID): Promise<readonly Match[]> {
    return Promise.resolve(
      [...this.matches.values()].filter(
        (match) => match.homeClubId === clubId || match.awayClubId === clubId,
      ),
    );
  }

  listByReferee(targetRefereeId: UUID): Promise<readonly Match[]> {
    return Promise.resolve(
      [...this.matches.values()].filter((match) => match.refereeId === targetRefereeId),
    );
  }

  updateStatus(id: UUID, status: MatchStatus): Promise<Match> {
    const match = this.matches.get(id);

    if (match === undefined) {
      throw new MatchNotFoundError(id);
    }

    const updatedMatch = { ...match, status };
    this.matches.set(id, updatedMatch);
    this.statusUpdates.push({ id, status });

    return Promise.resolve(updatedMatch);
  }
}

describe('MatchService', () => {
  it('gets a match by id', async () => {
    const match = buildMatch();
    const repository = new FakeMatchRepository([match]);
    const service = new MatchService({ matchesRepository: repository });

    await expect(service.getMatchById(match.id)).resolves.toEqual(match);
  });

  it('lists matches by federation', async () => {
    const match = buildMatch();
    const repository = new FakeMatchRepository([match]);
    const service = new MatchService({ matchesRepository: repository });

    await expect(service.listMatchesByFederation(federationId)).resolves.toEqual([match]);
  });

  it('lists matches by club', async () => {
    const match = buildMatch();
    const repository = new FakeMatchRepository([match]);
    const service = new MatchService({ matchesRepository: repository });

    await expect(service.listMatchesByClub(homeClubId)).resolves.toEqual([match]);
  });

  it('lists matches by referee', async () => {
    const match = buildMatch();
    const repository = new FakeMatchRepository([match]);
    const service = new MatchService({ matchesRepository: repository });

    await expect(service.listMatchesByReferee(refereeId)).resolves.toEqual([match]);
  });

  it('transitions match status when the state machine allows it', async () => {
    const match = buildMatch('scheduled');
    const repository = new FakeMatchRepository([match]);
    const service = new MatchService({ matchesRepository: repository });

    await expect(service.transitionMatchStatus(match.id, 'in_progress')).resolves.toMatchObject({
      id: match.id,
      status: 'in_progress',
    });
    expect(repository.statusUpdates).toEqual([{ id: match.id, status: 'in_progress' }]);
  });

  it('returns the current match without updating when status is unchanged', async () => {
    const match = buildMatch('scheduled');
    const repository = new FakeMatchRepository([match]);
    const service = new MatchService({ matchesRepository: repository });

    await expect(service.transitionMatchStatus(match.id, 'scheduled')).resolves.toEqual(match);
    expect(repository.statusUpdates).toEqual([]);
  });

  it('rejects invalid status transitions', async () => {
    const match = buildMatch('completed');
    const repository = new FakeMatchRepository([match]);
    const service = new MatchService({ matchesRepository: repository });

    await expect(service.transitionMatchStatus(match.id, 'in_progress')).rejects.toBeInstanceOf(
      InvalidMatchStatusTransitionError,
    );
  });

  it('rejects transitions for missing matches', async () => {
    const repository = new FakeMatchRepository();
    const service = new MatchService({ matchesRepository: repository });

    await expect(service.transitionMatchStatus(matchId, 'in_progress')).rejects.toBeInstanceOf(
      MatchNotFoundError,
    );
  });
});
