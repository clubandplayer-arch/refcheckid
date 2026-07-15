import { describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../src/config/application-container.js';
import type { Match } from '../src/domain/index.js';
import { createOpenApiDocument, createRestApiRouter } from '../src/api/index.js';

const authHeaders = {
  authorization:
    'Bearer eyJzdWIiOiI5MDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJlbWFpbCI6ImRpcmlnZW50ZUByZWZjaGVja2lkLmxvY2FsIiwicm9sZSI6Im1hbmFnZXIiLCJleHAiOjQxMDI0NDQ4MDAsInR5cCI6ImFjY2VzcyJ9.4HgrL-P9ZoeX9RL900wAjtIBQLv-MkMV9jVz_t5ceaE',
};
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
        headers: authHeaders,
        query: {},
        body: { status: 'in_progress' },
      }),
    ).resolves.toMatchObject({ status: 200, body: { id: match.id, status: 'in_progress' } });
  });

  it('filters player registrations by club id for manager rosters', async () => {
    const container = createApplicationContainer();
    await container.repositories.registrations.upsert({
      id: '61000000-0000-4000-8000-000000000001',
      playerId: '61000000-0000-4000-8000-000000000011',
      clubId: '61000000-0000-4000-8000-000000000021',
      season: '2026',
      registrationNumber: 'HOME-1',
      status: 'active',
      registeredAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });
    await container.repositories.registrations.upsert({
      id: '61000000-0000-4000-8000-000000000002',
      playerId: '61000000-0000-4000-8000-000000000012',
      clubId: '61000000-0000-4000-8000-000000000022',
      season: '2026',
      registrationNumber: 'AWAY-1',
      status: 'active',
      registeredAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });
    const router = createRestApiRouter(container);

    await expect(
      router.handle({
        method: 'GET',
        path: '/api/v1/player-registrations',
        headers: authHeaders,
        query: { clubId: '61000000-0000-4000-8000-000000000021' },
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: [expect.objectContaining({ id: '61000000-0000-4000-8000-000000000001' })],
    });
  });

  it('routes photo audit collection before generic photo id routes', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(
      router.handle({
        method: 'GET',
        path: '/api/v1/photos/audit',
        headers: authHeaders,
        query: {},
      }),
    ).resolves.toMatchObject({ status: 200, body: [] });
  });

  it('returns validation errors from controllers', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(
      router.handle({
        method: 'GET',
        path: '/api/v1/matches/not-a-uuid',
        headers: authHeaders,
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

it('returns the match photo manifest contract for referee recognition', async () => {
  const container = createApplicationContainer();
  await container.repositories.matches.upsert(match);
  const router = createRestApiRouter(container);

  await expect(
    router.handle({
      method: 'GET',
      path: `/api/v1/matches/${match.id}/photo-manifest`,
      headers: authHeaders,
      query: {},
    }),
  ).resolves.toMatchObject({
    status: 200,
    body: { matchId: match.id, manifestVersion: 'live-v1', status: 'unavailable', subjects: [] },
  });
});
