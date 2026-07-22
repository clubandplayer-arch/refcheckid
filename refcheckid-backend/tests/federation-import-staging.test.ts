import { describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../src/config/application-container.js';
import { createOpenApiDocument, createRestApiRouter } from '../src/api/index.js';
import { pilotIds } from '../src/config/pilot-data.js';

async function federationHeaders() {
  const router = createRestApiRouter(createApplicationContainer());
  const response = await router.handle({
    method: 'POST',
    path: '/api/v1/auth/login',
    headers: {},
    query: {},
    body: { email: 'federazione@refcheckid.local', password: 'Password123!' },
  });
  if (response.status !== 200) throw new Error('Federation login failed.');
  const body = response.body as { accessToken: string };
  return { authorization: `Bearer ${body.accessToken}` };
}

async function managerHeaders() {
  const router = createRestApiRouter(createApplicationContainer());
  const response = await router.handle({
    method: 'POST',
    path: '/api/v1/auth/login',
    headers: {},
    query: {},
    body: { email: 'dirigente@refcheckid.local', password: 'Password123!' },
  });
  if (response.status !== 200) throw new Error('Manager login failed.');
  const body = response.body as { accessToken: string };
  return { authorization: `Bearer ${body.accessToken}` };
}

const stagedImportBody = {
  federationId: pilotIds.federation,
  importType: 'players_general',
  originalFilename: 'tesserati_generale.csv',
  mimeType: 'text/csv',
  fileSizeBytes: 2048,
  sha256: '4b2a1f0c6d9c5e5a9f1b7c3d2e1a0f4b8c6d9e2f1a3b5c7d9e0f1a2b3c4d5e6f',
  sourceSystem: 'federation-export',
};

describe('PR2 federation import batch/staging', () => {
  it('stages an import batch without writing final domain rows', async () => {
    const container = createApplicationContainer();
    const router = createRestApiRouter(container);
    const headers = await federationHeaders();
    const clubsBefore = await container.repositories.clubs.list();
    const playersBefore = await container.repositories.players.list();
    const matchesBefore = await container.repositories.matches.list();

    const response = await router.handle({
      method: 'POST',
      path: '/api/v1/federation-imports',
      headers,
      query: {},
      body: stagedImportBody,
    });

    expect(response).toMatchObject({
      status: 202,
      body: {
        importBatch: {
          federationId: pilotIds.federation,
          importType: 'players_general',
          originalFilename: 'tesserati_generale.csv',
          status: 'uploaded',
          totalRows: 0,
          committedRows: 0,
        },
      },
    });
    await expect(container.repositories.clubs.list()).resolves.toHaveLength(clubsBefore.length);
    await expect(container.repositories.players.list()).resolves.toHaveLength(playersBefore.length);
    await expect(container.repositories.matches.list()).resolves.toHaveLength(matchesBefore.length);
  });

  it('lists batch detail and empty staging rows before parser PRs', async () => {
    const container = createApplicationContainer();
    const router = createRestApiRouter(container);
    const headers = await federationHeaders();
    const created = await router.handle({
      method: 'POST',
      path: '/api/v1/federation-imports',
      headers,
      query: {},
      body: { ...stagedImportBody, importType: 'clubs', originalFilename: 'societa.csv' },
    });
    const id = (created.body as { importBatch: { id: string } }).importBatch.id;

    await expect(
      router.handle({ method: 'GET', path: '/api/v1/federation-imports', headers, query: {} }),
    ).resolves.toMatchObject({ status: 200, body: [expect.objectContaining({ id })] });
    await expect(
      router.handle({ method: 'GET', path: `/api/v1/federation-imports/${id}`, headers, query: {} }),
    ).resolves.toMatchObject({ status: 200, body: { id, status: 'uploaded' } });
    await expect(
      router.handle({
        method: 'GET',
        path: `/api/v1/federation-imports/${id}/rows`,
        headers,
        query: {},
      }),
    ).resolves.toMatchObject({ status: 200, body: [] });
  });

  it('forbids manager import creation', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(
      router.handle({
        method: 'POST',
        path: '/api/v1/federation-imports',
        headers: await managerHeaders(),
        query: {},
        body: stagedImportBody,
      }),
    ).resolves.toMatchObject({ status: 403, body: { error: 'FORBIDDEN' } });
  });

  it('documents import staging endpoints in OpenAPI', () => {
    const document = createOpenApiDocument();

    expect(document.paths['/api/v1/federation-imports']).toMatchObject({
      get: { 'x-implementation-status': 'implemented' },
      post: { 'x-implementation-status': 'implemented' },
    });
    expect(document.paths['/api/v1/federation-imports/{id}/rows']).toBeDefined();
  });
});
