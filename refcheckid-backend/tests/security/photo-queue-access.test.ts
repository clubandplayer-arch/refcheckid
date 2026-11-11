import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { preparedApp, login, dataset } from '../runtime-fixtures.js';
import { createRestApiRouter } from '../../src/api/router.js';
import { validPhotoContentToken } from '../../src/api/photo-content-token.js';

it('paginates only authorized approvals, separates counts and signs bounded thumbnail URLs', async () => {
  const app = await preparedApp();
  try {
    const federationId = dataset.federationSyncPayload.federations[0].id;
    for (let i = 0; i < 14; i++) await app.repositories.photoApprovals.create({ federationId,
      photoVersionId: randomUUID(), registrationId: dataset.federationSyncPayload.playerRegistrations[0].id,
      status: 'pending', requestedAt: '2026-11-11T00:00:00.000Z', slaDueAt: null });
    await app.repositories.photoApprovals.create({ federationId: randomUUID(), photoVersionId: randomUUID(),
      status: 'pending', requestedAt: '2026-11-11T00:00:00.000Z', registrationId: null, slaDueAt: null });
    const router = createRestApiRouter(app);
    const federation = await login(router, 'federation');
    const home = await login(router, 'homeManager');
    const get = (path: string, headers = federation, query: Record<string, string> = {}) => router.handle({ method: 'GET', path, headers, query });
    expect((await get('/api/v1/photo-approvals/page', home)).status).toBe(403);
    expect((await get('/api/v1/photo-approvals/summary')).body).toEqual({ pending: 14 });
    const response = await get('/api/v1/photo-approvals/page', federation, { status: 'pending' });
    expect(response.status).toBe(200);
    const page = response.body as { items: { id: string; photoVersionId: string; proposedPhotoUrl: string; federationId: string }[]; total: number; nextCursor: string };
    expect(page.items).toHaveLength(12); expect(page.total).toBe(14);
    expect(page.items.every((item) => item.federationId === federationId)).toBe(true);
    const url = new URL(page.items[0].proposedPhotoUrl, 'http://localhost');
    const query = Object.fromEntries(url.searchParams);
    expect(query.rendition).toBe('thumb_320');
    expect(validPhotoContentToken(page.items[0].photoVersionId, query)).toBe(true);
    expect(validPhotoContentToken(page.items[0].photoVersionId, { ...query, rendition: 'normalized' })).toBe(false);
    const next = await get('/api/v1/photo-approvals/page', federation, { status: 'pending', cursor: page.nextCursor });
    expect((next.body as { items: unknown[] }).items).toHaveLength(2);
    expect((await get('/api/v1/photo-approvals/page', federation, { cursor: 'invalid' })).status).toBe(400);
  } finally { await app.store.close(); }
});
