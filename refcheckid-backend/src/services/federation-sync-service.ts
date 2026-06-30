import type { EventPublisher } from '../events/index.js';

export interface FederationSyncServiceDependencies {
  readonly eventPublisher?: EventPublisher;
}

export class FederationSyncService {
  constructor(private readonly dependencies: FederationSyncServiceDependencies = {}) {}

  describe(): string {
    return 'FederationSyncService skeleton';
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
