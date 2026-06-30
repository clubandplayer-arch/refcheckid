import type { MatchEvent, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export class EventRepository extends DrizzleRepository<MatchEvent> {
  constructor(initialRows: readonly MatchEvent[] = []) {
    super({ tableName: 'match_events', initialRows });
  }

  listByMatch(matchId: UUID): Promise<readonly MatchEvent[]> {
    return Promise.resolve(this.values().filter((event) => event.matchId === matchId));
  }
}

export class EventsRepository extends EventRepository {}
