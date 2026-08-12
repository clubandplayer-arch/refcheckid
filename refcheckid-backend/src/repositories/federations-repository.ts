import type { Federation } from '../domain/index.js';
import { PersistentRuntimeRepository } from './runtime-state-repository.js';

export class FederationRepository extends PersistentRuntimeRepository<Federation> {
  constructor(initialRows: readonly Federation[] = [], persistenceRoot?: string | null) {
    super('federations', 'federations.json', initialRows, persistenceRoot);
  }
}

export class FederationsRepository extends FederationRepository {}
