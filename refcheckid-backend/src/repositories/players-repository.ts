import type { Player, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export class PlayerRepository extends DrizzleRepository<Player> {
  constructor(initialRows: readonly Player[] = []) {
    super({ tableName: 'players', initialRows });
  }

  listByFederation(federationId: UUID): Promise<readonly Player[]> {
    return Promise.resolve(this.values().filter((player) => player.federationId === federationId));
  }
}

export class PlayersRepository extends PlayerRepository {}
