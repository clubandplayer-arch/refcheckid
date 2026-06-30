import { describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../src/config/application-container.js';
import type { Match } from '../src/domain/index.js';
import { createOpenApiDocument, createRestApiRouter } from '../src/api/index.js';

const actorId = '60000000-0000-4000-8000-000000000001';
const match: Match = {
  id: '60000000-0000-4000-8000-000000000002',
  federationId: '60000000-0000-4000-8000-000000000003',
  homeClubId: '60000000-0000-4000-8000-000000000004',
  awayClubId: '60000000-0000-4000-8000-000000000005',
  refereeId: '60000000-0000-4000-8000-000000000006',
  season: '2026',
  scheduledAt: '2026-06-30T12:00:00.000Z',
  venue: 'Main Field',
  status: 'scheduled',
  createdAt: '2026-06-30T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  deletedAt: null,
};

describe('REST API layer', () => {
  it('serves health checks without authentication', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(
      router.handle({ method: 'GET', path: '/api/health', headers: {}, query: {} }),
    ).resolves.toMatchObject({ status: 200, body: { status: 'ok' } });
  });

  it('protects versioned routes with authentication middleware', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(
      router.handle({ method: 'GET', path: '/api/v1/matches', headers: {}, query: {} }),
    ).resolves.toMatchObject({ status: 401 });
  });

  it('routes controllers to services and repositories', async () => {
    const container = createApplicationContainer();
    await container.repositories.matches.upsert(match);
    const router = createRestApiRouter(container);

    await expect(
      router.handle({
        method: 'POST',
        path: `/api/v1/matches/${match.id}/status`,
        headers: { 'x-actor-id': actorId },
        query: {},
        body: { status: 'in_progress' },
      }),
    ).resolves.toMatchObject({ status: 200, body: { id: match.id, status: 'in_progress' } });
  });

  it('returns validation errors from controllers', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(
      router.handle({
        method: 'GET',
        path: '/api/v1/matches/not-a-uuid',
        headers: { 'x-actor-id': actorId },
        query: {},
      }),
    ).resolves.toMatchObject({ status: 400, body: { error: 'VALIDATION_ERROR' } });
  });

  it('generates OpenAPI 3.1 documentation for v1 routes', () => {
    const document = createOpenApiDocument();

    expect(document.openapi).toBe('3.1.0');
    expect(document.paths['/api/v1/matches']).toBeDefined();
    expect(document.paths['/api/v1/identity-documents']).toBeDefined();
  });
});
