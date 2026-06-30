import type { EventPublisher } from '../events/index.js';

export interface AuditServiceDependencies {
  readonly eventPublisher?: EventPublisher;
}

export class AuditService {
  constructor(private readonly dependencies: AuditServiceDependencies = {}) {}

  describe(): string {
    return 'AuditService skeleton';
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
