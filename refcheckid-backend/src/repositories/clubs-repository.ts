import type { Club, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export class ClubRepository extends DrizzleRepository<Club> {
  constructor(initialRows: readonly Club[] = []) {
    super({ tableName: 'clubs', initialRows });
  }

  listByFederation(federationId: UUID): Promise<readonly Club[]> {
    return Promise.resolve(this.values().filter((club) => club.federationId === federationId));
  }
}

export class ClubsRepository extends ClubRepository {}
