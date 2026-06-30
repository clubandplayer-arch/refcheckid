import type { EventPublisher } from '../events/index.js';

export interface MatchSheetServiceDependencies {
  readonly eventPublisher?: EventPublisher;
}

export class MatchSheetService {
  constructor(private readonly dependencies: MatchSheetServiceDependencies = {}) {}

  describe(): string {
    return 'MatchSheetService skeleton';
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
