import type { EventPublisher } from '../events/index.js';

export interface MatchReportServiceDependencies {
  readonly eventPublisher?: EventPublisher;
}

export class MatchReportService {
  constructor(private readonly dependencies: MatchReportServiceDependencies = {}) {}

  describe(): string {
    return 'MatchReportService skeleton';
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
