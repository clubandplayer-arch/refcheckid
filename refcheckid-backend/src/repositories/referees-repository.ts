import type { Referee, UUID } from '../domain/index.js';
import { PersistentRuntimeRepository } from './runtime-state-repository.js';

export class RefereeRepository extends PersistentRuntimeRepository<Referee> {
  constructor(initialRows: readonly Referee[] = [], persistenceRoot?: string | null) {
    super('referees', 'referees.json', initialRows, persistenceRoot);
  }

  listByFederation(federationId: UUID): Promise<readonly Referee[]> {
    return Promise.resolve(
      this.values().filter((referee) => referee.federationId === federationId),
    );
  }
}

export class RefereesRepository extends RefereeRepository {}
