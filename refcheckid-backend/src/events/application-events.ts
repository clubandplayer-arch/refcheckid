import type { ISODateTime, UUID } from '../domain/index.js';

export const applicationEventTypes = [
  'MATCH_CREATED',
  'MATCH_SHEET_CREATED',
  'MATCH_SHEET_SUBMITTED',
  'MATCH_SHEET_LOCKED',
  'RECOGNITION_STARTED',
  'RECOGNITION_COMPLETED',
  'MATCH_REPORT_CREATED',
  'MATCH_REPORT_SUBMITTED',
  'MATCH_ARCHIVED',
] as const;

export type ApplicationEventType = (typeof applicationEventTypes)[number];

export interface ApplicationEvent<
  TPayload extends Record<string, unknown> = Record<string, never>,
> {
  id: UUID;
  type: ApplicationEventType;
  occurredAt: ISODateTime;
  payload: TPayload;
}

export interface EventHandler<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  handle(event: ApplicationEvent<TPayload>): Promise<void>;
}

export type EventHandlerFunction<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = (event: ApplicationEvent<TPayload>) => Promise<void> | void;

export interface EventPublisher {
  publish(event: ApplicationEvent<Record<string, unknown>>): Promise<void>;
}

export class EventDispatcher implements EventPublisher {
  private readonly handlers = new Map<ApplicationEventType, EventHandlerFunction[]>();

  register(
    eventType: ApplicationEventType,
    handler: EventHandler | EventHandlerFunction,
  ): () => void {
    const handlers = this.handlers.get(eventType) ?? [];
    const handlerFunction: EventHandlerFunction =
      typeof handler === 'function'
        ? handler
        : (event: ApplicationEvent<Record<string, unknown>>) => handler.handle(event);
    handlers.push(handlerFunction);
    this.handlers.set(eventType, handlers);

    return () => this.unregister(eventType, handlerFunction);
  }

  unregister(eventType: ApplicationEventType, handler: EventHandlerFunction): void {
    const handlers = this.handlers.get(eventType) ?? [];
    this.handlers.set(
      eventType,
      handlers.filter((registeredHandler) => registeredHandler !== handler),
    );
  }

  async publish(event: ApplicationEvent<Record<string, unknown>>): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];

    for (const handler of handlers) {
      await handler(event);
    }
  }

  registeredHandlerCount(eventType: ApplicationEventType): number {
    return this.handlers.get(eventType)?.length ?? 0;
  }
}

export class NoopEventPublisher implements EventPublisher {
  readonly publishedEvents: ApplicationEvent<Record<string, unknown>>[] = [];

  publish(event: ApplicationEvent<Record<string, unknown>>): Promise<void> {
    this.publishedEvents.push(event);
    return Promise.resolve();
  }
}
