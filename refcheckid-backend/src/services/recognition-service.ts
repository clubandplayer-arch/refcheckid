import type { EventPublisher } from '../events/index.js';

export interface RecognitionServiceDependencies {
  readonly eventPublisher?: EventPublisher;
}

export class RecognitionService {
  constructor(private readonly dependencies: RecognitionServiceDependencies = {}) {}

  describe(): string {
    return 'RecognitionService skeleton';
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
