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

export interface EventPublisher {
  publish(event: ApplicationEvent<Record<string, unknown>>): Promise<void>;
}

export class NoopEventPublisher implements EventPublisher {
  readonly publishedEvents: ApplicationEvent<Record<string, unknown>>[] = [];

  publish(event: ApplicationEvent<Record<string, unknown>>): Promise<void> {
    this.publishedEvents.push(event);
    return Promise.resolve();
  }
}
