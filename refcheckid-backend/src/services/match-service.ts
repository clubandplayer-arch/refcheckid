import type { EventPublisher } from '../events/index.js';

export interface MatchServiceDependencies {
  readonly eventPublisher?: EventPublisher;
}

export class MatchService {
  constructor(private readonly dependencies: MatchServiceDependencies = {}) {}

  describe(): string {
    return 'MatchService skeleton';
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
