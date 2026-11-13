import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { preparedApp, dataset } from './runtime-fixtures.js';
import { createRestApiRouter } from '../src/api/router.js';
import type { AuthContext } from '../src/api/http.js';
it('preflights annual reasons, uses bounded own-club metadata and creates one pending approval across retries and competing uploads', async () => {
  const app = await preparedApp(),
    router = createRestApiRouter(app),
    person = dataset.photoPlan.find(
      (p) => p.subjectKind === 'athlete' && p.manager === 'homeManager',
    )!,
    federationId = dataset.federationSyncPayload.federations[0].id,
    clubId = dataset.federationSyncPayload.clubs[0].id;
  const manager: AuthContext = { actorId: randomUUID(), roles: ['manager'], clubIds: [clubId] },
    federation: AuthContext = {
      actorId: randomUUID(),
      roles: ['federation'],
      federationIds: [federationId],
    };
  const call = (path: string, body?: unknown, auth = manager) => {
    const url = new URL(path, 'https://test.invalid');
    return router.handle({
      method: body ? 'POST' : 'GET',
      path: url.pathname,
      headers: {},
      query: Object.fromEntries(url.searchParams),
      ...(body ? { body } : {}),
      auth,
    });
  };
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  const upload = {
    subjectKind: person.subjectKind,
    subjectId: person.subjectId,
    registrationId: person.registrationId,
    federationId,
    seasonId: dataset.seasonId,
    mimeType: 'image/png',
    fileSizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  const policy = () =>
    call(`/api/v1/platform/club-photo-roster/${clubId}?registrations=${person.registrationId}`);
  try {
    expect((await policy()).body).toMatchObject({
      items: [{ status: 'missing', requiresReplacementReason: false }],
    });
    const first = await call('/api/v1/photos/upload-intent', upload),
      parallel = await call('/api/v1/photos/upload-intent', upload);
    expect(first.status).toBe(202);
    expect(parallel.status).toBe(202);
    type Intent = { intent: { uploadId: string; objectKey: string } };
    const a = (first.body as Intent).intent,
      b = (parallel.body as Intent).intent;
    const complete = await call(`/api/v1/photos/uploads/${a.uploadId}/complete`, {
      objectKey: a.objectKey,
      contentBase64: bytes.toString('base64'),
    });
    expect(complete.status).toBe(200);
    expect(
      (
        await call(`/api/v1/photos/uploads/${a.uploadId}/complete`, {
          objectKey: a.objectKey,
          contentBase64: bytes.toString('base64'),
        })
      ).body,
    ).toEqual(complete.body);
    expect(
      (
        await call(`/api/v1/photos/uploads/${b.uploadId}/complete`, {
          objectKey: b.objectKey,
          contentBase64: bytes.toString('base64'),
        })
      ).status,
    ).toBe(409);
    expect((await call('/api/v1/photos/upload-intent', upload)).status).toBe(409);
    let approvals = await app.repositories.photoApprovals.listPendingForRegistration(
      person.registrationId,
      dataset.seasonId,
    );
    expect(approvals).toHaveLength(1);
    expect((await policy()).body).toMatchObject({
      items: [{ status: 'pending', approvalId: approvals[0].id }],
    });
    await call(
      `/api/v1/photo-approvals/${approvals[0].id}/approve`,
      { reasonCode: 'identity_verified' },
      federation,
    );
    const replacement = (await call('/api/v1/photos/upload-intent', upload)).body as Intent;
    await call(`/api/v1/photos/uploads/${replacement.intent.uploadId}/complete`, {
      objectKey: replacement.intent.objectKey,
      contentBase64: bytes.toString('base64'),
    });
    approvals = await app.repositories.photoApprovals.listPendingForRegistration(
      person.registrationId,
      dataset.seasonId,
    );
    await call(
      `/api/v1/photo-approvals/${approvals[0].id}/approve`,
      { reasonCode: 'identity_verified' },
      federation,
    );
    expect((await policy()).body).toMatchObject({
      items: [{ status: 'active', requiresReplacementReason: true }],
    });
    expect(
      ((await policy()).body as { items: { currentPhotoUrl: string }[] }).items[0].currentPhotoUrl,
    ).toContain('rendition=thumb_320');
    const before = (await app.repositories.photoVersions.list()).length;
    expect((await call('/api/v1/photos/upload-intent', upload)).status).toBe(409);
    expect((await app.repositories.photoVersions.list()).length).toBe(before);
    expect(
      await app.repositories.photoApprovals.listPendingForRegistration(
        person.registrationId,
        dataset.seasonId,
      ),
    ).toHaveLength(0);
    const foreign = dataset.photoPlan.find((p) => p.manager === 'awayManager')!;
    expect(
      (
        await call(
          `/api/v1/platform/club-photo-roster/${clubId}?registrations=${foreign.registrationId}`,
        )
      ).status,
    ).toBe(403);
  } finally {
    await app.store.close();
  }
});
