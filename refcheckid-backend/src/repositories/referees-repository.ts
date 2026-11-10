import type { Referee, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export class RefereeRepository extends DrizzleRepository<Referee> {
  constructor(initialRows: readonly Referee[] = []) {
    super({ tableName: 'referees', initialRows });
  }

  async listByFederation(federationId: UUID): Promise<readonly Referee[]> {
    return Promise.resolve(
      (await this.values()).filter((referee) => referee.federationId === federationId),
    );
  }
}

export class RefereesRepository extends RefereeRepository {}
