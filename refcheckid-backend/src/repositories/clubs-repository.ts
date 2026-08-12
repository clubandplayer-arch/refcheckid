import type { Club, UUID } from '../domain/index.js';
import { PersistentRuntimeRepository } from './runtime-state-repository.js';

export class ClubRepository extends PersistentRuntimeRepository<Club> {
  constructor(initialRows: readonly Club[] = [], persistenceRoot?: string | null) {
    super('clubs', 'clubs.json', initialRows, persistenceRoot);
  }

  listByFederation(federationId: UUID): Promise<readonly Club[]> {
    return Promise.resolve(this.values().filter((club) => club.federationId === federationId));
  }
}

export class ClubsRepository extends ClubRepository {}
