import { describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../src/config/application-container.js';
import type { Match } from '../src/domain/index.js';
import { createOpenApiDocument, createRestApiRouter } from '../src/api/index.js';

const authHeaders = { authorization: 'Bearer eyJzdWIiOiI5MDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJlbWFpbCI6ImRpcmlnZW50ZUByZWZjaGVja2lkLmxvY2FsIiwicm9sZSI6Im1hbmFnZXIiLCJleHAiOjQxMDI0NDQ4MDAsInR5cCI6ImFjY2VzcyJ9.4HgrL-P9ZoeX9RL900wAjtIBQLv-MkMV9jVz_t5ceaE' };
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
