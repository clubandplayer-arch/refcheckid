import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/index.js';
import { createApplicationContainer } from '../../src/config/application-container.js';

describe('smoke: runnable backend API surface', () => {
  it('exposes health, versioned OpenAPI, and versioned Swagger routes', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(router.handle({ method: 'GET', path: '/api/health', headers: {}, query: {} })).resolves.toMatchObject({ status: 200 });
    await expect(router.handle({ method: 'GET', path: '/api/v1/openapi.json', headers: {}, query: {} })).resolves.toMatchObject({ status: 200, body: { openapi: '3.1.0' } });
    await expect(router.handle({ method: 'GET', path: '/api/v1/swagger', headers: {}, query: {} })).resolves.toMatchObject({ status: 200 });
  });
});
