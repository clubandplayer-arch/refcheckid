import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/index.js';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { authHeaders } from '../test-fixtures.js';

describe('security: JWT/RLS/roles/permissions/API/storage gates', () => {
  it('rejects protected API calls without JWT-compatible actor context', async () => {
    const router = createRestApiRouter(createApplicationContainer());
    await expect(router.handle({ method: 'GET', path: '/api/v1/photos', headers: {}, query: {} })).resolves.toMatchObject({ status: 401, body: { error: 'UNAUTHENTICATED' } });
  });

  it('propagates request correlation headers for auditability', async () => {
    const router = createRestApiRouter(createApplicationContainer());
    const response = await router.handle({ method: 'GET', path: '/api/v1/photos', headers: { ...authHeaders, 'x-request-id': 'req-security-1' }, query: {} });
    expect(response.headers).toMatchObject({ 'x-request-id': 'req-security-1', 'x-correlation-id': 'req-security-1' });
  });

  it('keeps storage-backed identity documents behind authenticated routes', async () => {
    const router = createRestApiRouter(createApplicationContainer());
    await expect(router.handle({ method: 'GET', path: '/api/v1/identity-documents', headers: authHeaders, query: {} })).resolves.toMatchObject({ status: 200, body: [] });
  });

  it('authorizes manager Bearer tokens on match-sheet routes', async () => {
    const router = createRestApiRouter(createApplicationContainer());
    await expect(
      router.handle({
        headers: authHeaders,
        method: 'GET',
        path: '/api/v1/match-sheets',
        query: {},
      }),
    ).resolves.toMatchObject({ status: 200 });
  });
});
