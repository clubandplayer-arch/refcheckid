import type { Federation } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export class FederationRepository extends DrizzleRepository<Federation> {
  constructor(initialRows: readonly Federation[] = []) {
    super({ tableName: 'federations', initialRows });
  }
}

export class FederationsRepository extends FederationRepository {}
