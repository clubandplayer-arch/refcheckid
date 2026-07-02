import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/index.js';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { createRuntimeServer } from '../../src/server.js';

describe('smoke: runnable backend API surface', () => {
  it('exposes health, versioned OpenAPI, and versioned Swagger routes', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(router.handle({ method: 'GET', path: '/api/health', headers: {}, query: {} })).resolves.toMatchObject({ status: 200 });
    await expect(router.handle({ method: 'GET', path: '/api/v1/openapi.json', headers: {}, query: {} })).resolves.toMatchObject({ status: 200, body: { openapi: '3.1.0' } });
    await expect(router.handle({ method: 'GET', path: '/api/v1/swagger', headers: {}, query: {} })).resolves.toMatchObject({ status: 200 });
  });

  it('serves a useful backend root landing response', async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/`);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await expect(response.text()).resolves.toContain('RefCheckID Backend API');
  });
});
