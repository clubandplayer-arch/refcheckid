import type { MatchEvent } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class EventsRepository extends NotImplementedRepository<MatchEvent> {
  constructor() {
    super('EventsRepository');
  }
}
