import { describe, expect, it } from 'vitest';
import { applicationEventTypes, NoopEventPublisher } from '../src/events/index.js';

describe('event engine skeleton', () => {
  it('declares approved application events', () => {
    expect(applicationEventTypes).toContain('MATCH_CREATED');
    expect(applicationEventTypes).toContain('MATCH_ARCHIVED');
  });

  it('publishes events to the noop publisher buffer', async () => {
    const publisher = new NoopEventPublisher();
    await publisher.publish({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'MATCH_CREATED',
      occurredAt: '2026-06-30T00:00:00.000Z',
      payload: {},
    });

    expect(publisher.publishedEvents).toHaveLength(1);
  });
});
