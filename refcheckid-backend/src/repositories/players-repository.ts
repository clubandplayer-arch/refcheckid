import type { Player, UUID } from '../domain/index.js';
import { PersistentRuntimeRepository } from './runtime-state-repository.js';

export class PlayerRepository extends PersistentRuntimeRepository<Player> {
  constructor(initialRows: readonly Player[] = [], persistenceRoot?: string | null) {
    super('players', 'players.json', initialRows, persistenceRoot);
  }

  listByFederation(federationId: UUID): Promise<readonly Player[]> {
    return Promise.resolve(this.values().filter((player) => player.federationId === federationId));
  }
}

export class PlayersRepository extends PlayerRepository {}
