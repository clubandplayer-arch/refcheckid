import { describe, expect, it } from 'vitest';
import type { Federation, Match } from '../src/domain/index.js';
import { EventDispatcher } from '../src/events/index.js';
import {
  ClubRepository,
  FederationRepository,
  MatchRepository,
  PlayerRepository,
  RefereeRepository,
  RegistrationRepository,
} from '../src/repositories/index.js';
import { FederationSyncService, MatchService } from '../src/services/index.js';

const federation: Federation = {
  id: '50000000-0000-0000-0000-000000000001',
  name: 'Federation',
  fiscalCode: null,
  status: 'active',
  createdAt: '2026-06-30T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  deletedAt: null,
};

const match: Match = {
  id: '50000000-0000-0000-0000-000000000002',
  federationId: federation.id,
  homeClubId: '50000000-0000-0000-0000-000000000003',
  awayClubId: '50000000-0000-0000-0000-000000000004',
  refereeId: '50000000-0000-0000-0000-000000000005',
  season: '2026',
  scheduledAt: '2026-06-30T12:00:00.000Z',
  venue: 'Main Field',
  status: 'scheduled',
  createdAt: '2026-06-30T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  deletedAt: null,
};

describe('application layer runtime', () => {
  it('wires services to concrete repositories through dependency injection', async () => {
    const matchesRepository = new MatchRepository([match]);
    const service = new MatchService({ matchesRepository });

    await expect(service.transitionMatchStatus(match.id, 'in_progress')).resolves.toMatchObject({
      id: match.id,
      status: 'in_progress',
    });
  });

  it('syncs federation data through concrete repositories', async () => {
    const federationsRepository = new FederationRepository();
    const service = new FederationSyncService({
      federationsRepository,
      clubsRepository: new ClubRepository(),
      refereesRepository: new RefereeRepository(),
      playersRepository: new PlayerRepository(),
      registrationsRepository: new RegistrationRepository(),
      matchesRepository: new MatchRepository(),
    });

    await expect(service.syncAll({ federations: [federation], matches: [match] })).resolves.toEqual(
      {
        federations: 1,
        clubs: 0,
        referees: 0,
        players: 0,
        playerRegistrations: 0,
        staffMembers: 0,
        staffRegistrations: 0,
        matches: 1,
      },
    );
    await expect(federationsRepository.findById(federation.id)).resolves.toEqual(federation);
  });

  it('dispatches dynamically registered event handlers', async () => {
    const dispatcher = new EventDispatcher();
    const handledEventIds: string[] = [];
    const unregister = dispatcher.register('MATCH_CREATED', (event) => {
      handledEventIds.push(event.id);
    });

    await dispatcher.publish({
      id: '50000000-0000-0000-0000-000000000006',
      type: 'MATCH_CREATED',
      occurredAt: '2026-06-30T12:00:00.000Z',
      payload: { matchId: match.id },
    });
    unregister();

    expect(handledEventIds).toEqual(['50000000-0000-0000-0000-000000000006']);
    expect(dispatcher.registeredHandlerCount('MATCH_CREATED')).toBe(0);
  });
});
