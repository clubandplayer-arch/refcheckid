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

describe('federation import batch/staging parser flow', () => {
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
      router.handle({
        method: 'GET',
        path: `/api/v1/federation-imports/${id}`,
        headers,
        query: {},
      }),
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

  it('parses CSV content, detects import type and stages normalized rows without final commits', async () => {
    const container = createApplicationContainer();
    const router = createRestApiRouter(container);
    const headers = await federationHeaders();
    const playersBefore = await container.repositories.players.list();
    const created = await router.handle({
      method: 'POST',
      path: '/api/v1/federation-imports',
      headers,
      query: {},
      body: {
        ...stagedImportBody,
        importType: 'players_general',
        originalFilename: 'tesserati_generale.csv',
      },
    });
    const id = (created.body as { importBatch: { id: string } }).importBatch.id;

    const parsed = await router.handle({
      method: 'POST',
      path: `/api/v1/federation-imports/${id}/parse`,
      headers,
      query: {},
      body: {
        csvContent:
          'codice_tessera,nome,cognome,data_nascita,stato_tesserato\nTESS001,Marco,Rossi,2006-04-12,active\nTESS002,Luca,Bianchi,2006-09-03,active',
      },
    });

    expect(parsed).toMatchObject({
      status: 200,
      body: {
        detectedType: 'players_general',
        confidence: 1,
        mapping: {
          codice_tessera: 'codice_tessera',
          nome: 'nome',
          cognome: 'cognome',
          data_nascita: 'data_nascita',
          stato_tesserato: 'stato_tesserato',
        },
        importBatch: { id, status: 'mapped', totalRows: 2, detectedType: 'players_general' },
        rows: [
          expect.objectContaining({
            rowNumber: 2,
            status: 'pending',
            normalizedData: expect.objectContaining({ codice_tessera: 'TESS001' }),
          }),
          expect.objectContaining({ rowNumber: 3 }),
        ],
      },
    });
    await expect(container.repositories.players.list()).resolves.toHaveLength(playersBefore.length);
  });

  it('detects common header synonyms and reports declared/detected mismatch warnings', async () => {
    const router = createRestApiRouter(createApplicationContainer());
    const headers = await federationHeaders();
    const created = await router.handle({
      method: 'POST',
      path: '/api/v1/federation-imports',
      headers,
      query: {},
      body: { ...stagedImportBody, importType: 'clubs', originalFilename: 'ambiguous.csv' },
    });
    const id = (created.body as { importBatch: { id: string } }).importBatch.id;

    await expect(
      router.handle({
        method: 'POST',
        path: `/api/v1/federation-imports/${id}/parse`,
        headers,
        query: {},
        body: {
          csvContent:
            'tessera,first_name,last_name,birth_date,status\nTESS003,Anna,Verdi,2007-01-01,active',
        },
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        detectedType: 'players_general',
        mapping: {
          codice_tessera: 'tessera',
          nome: 'first_name',
          cognome: 'last_name',
          data_nascita: 'birth_date',
          stato_tesserato: 'status',
        },
        warnings: [expect.stringContaining('differs from declared type clubs')],
      },
    });
  });

  it('validates parsed rows and builds a preview report without final commits', async () => {
    const container = createApplicationContainer();
    const router = createRestApiRouter(container);
    const headers = await federationHeaders();
    const playersBefore = await container.repositories.players.list();
    const created = await router.handle({
      method: 'POST',
      path: '/api/v1/federation-imports',
      headers,
      query: {},
      body: {
        ...stagedImportBody,
        importType: 'players_general',
        originalFilename: 'tesserati_generale.csv',
      },
    });
    const id = (created.body as { importBatch: { id: string } }).importBatch.id;

    await router.handle({
      method: 'POST',
      path: `/api/v1/federation-imports/${id}/parse`,
      headers,
      query: {},
      body: {
        csvContent:
          'codice_tessera,nome,cognome,data_nascita,stato_tesserato\nTESS010,Paolo,Rossi,2006-04-12,active\nTESS011,Sara,Neri,2007-01-02,inactive',
      },
    });

    const validated = await router.handle({
      method: 'POST',
      path: `/api/v1/federation-imports/${id}/validate`,
      headers,
      query: {},
      body: {},
    });

    expect(validated).toMatchObject({
      status: 200,
      body: {
        importBatch: {
          id,
          status: 'validated',
          totalRows: 2,
          errorRows: 0,
          warningRows: 2,
        },
        report: {
          phase: 'validation_preview',
          summary: {
            totalRows: 2,
            errorRows: 0,
            warningRows: 2,
            newRows: 2,
            commitBlocked: false,
          },
        },
        rows: [
          expect.objectContaining({
            status: 'warning',
            warnings: [expect.stringContaining('Preview: row will be treated as new')],
          }),
          expect.objectContaining({ status: 'warning' }),
        ],
      },
    });
    await expect(container.repositories.players.list()).resolves.toHaveLength(playersBefore.length);
  });

  it('marks invalid and duplicate rows as blocking validation errors', async () => {
    const router = createRestApiRouter(createApplicationContainer());
    const headers = await federationHeaders();
    const created = await router.handle({
      method: 'POST',
      path: '/api/v1/federation-imports',
      headers,
      query: {},
      body: {
        ...stagedImportBody,
        importType: 'calendar',
        originalFilename: 'calendario.csv',
      },
    });
    const id = (created.body as { importBatch: { id: string } }).importBatch.id;

    await router.handle({
      method: 'POST',
      path: `/api/v1/federation-imports/${id}/parse`,
      headers,
      query: {},
      body: {
        csvContent:
          'codice_gara,stagione,data,ora,codice_societa_casa,codice_societa_ospite,stato_gara\nGARA900,2026/2027,2026-09-20,15:00,CLUB001,CLUB002,scheduled\nGARA900,2026/2027,20/09/2026,1500,CLUB001,CLUB001,bozza',
      },
    });

    await expect(
      router.handle({
        method: 'POST',
        path: `/api/v1/federation-imports/${id}/validate`,
        headers,
        query: {},
        body: {},
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        importBatch: { status: 'validated', errorRows: 2 },
        report: {
          summary: {
            totalRows: 2,
            errorRows: 2,
            duplicateRows: 2,
            commitBlocked: true,
          },
        },
        rows: [
          expect.objectContaining({
            status: 'error',
            errors: [expect.stringContaining('Duplicate row key')],
          }),
          expect.objectContaining({
            status: 'error',
            errors: expect.arrayContaining([
              expect.stringContaining('Invalid ISO date data'),
              expect.stringContaining('Invalid time ora'),
              expect.stringContaining('Home and away society codes must be different'),
            ]),
          }),
        ],
      },
    });
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
    expect(document.paths['/api/v1/federation-imports/{id}/parse']).toBeDefined();
    expect(document.paths['/api/v1/federation-imports/{id}/validate']).toBeDefined();
    expect(document.paths['/api/v1/federation-imports/{id}/rows']).toBeDefined();
  });
});
