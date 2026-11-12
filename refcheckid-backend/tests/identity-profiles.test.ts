import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { preparedApp, dataset } from './runtime-fixtures.js';
import { Profiles } from '../src/platform/profiles.js';
import { createRestApiRouter } from '../src/api/router.js';
import { Imports } from '../src/platform/imports.js';
it('isolates profile owners, protects federation logos and normalizes uploaded images', async () => {
  const app = await preparedApp(),
    federationId = dataset.federationSyncPayload.federations[0].id,
    clubId = dataset.federationSyncPayload.clubs[0].id,
    otherClubId = dataset.federationSyncPayload.clubs[1].id;
  const manager = new Profiles(app, {
      actorId: randomUUID(),
      roles: ['manager'],
      clubIds: [clubId],
    }),
    federation = new Profiles(app, {
      actorId: randomUUID(),
      roles: ['federation'],
      federationIds: [federationId],
    });
  const picture =
    'data:image/png;base64,' +
    (
      await sharp({ create: { width: 640, height: 400, channels: 4, background: '#112233' } })
        .png()
        .toBuffer()
    ).toString('base64');
  try {
    await expect(
      manager.save('club', otherClubId, { revision: 0, imageBase64: picture }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      manager.save('organization', federationId, { revision: 0, primaryColor: '#000000' }),
    ).rejects.toMatchObject({ status: 403 });
    const first = await manager.save('club', clubId, {
      revision: 0,
      imageBase64: picture,
      displayName: 'My Club',
    });
    expect(first.imageUrl).toMatch(/^data:image\/webp;base64,/);
    expect(first.imageSource).toBe('owner');
    const stored = (await manager.raw('club', clubId))!;
    expect(JSON.stringify(stored)).not.toContain('base64');
    const bytes = await app.objectStores.photos.readObject(stored.imageKey!);
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: 'webp',
      width: 320,
      height: 320,
    });
    await expect(manager.save('club', clubId, { revision: 0 })).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      manager.save('club', clubId, {
        revision: 1,
        imageBase64: 'data:image/svg+xml;base64,PHN2Zz4=',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      manager.save('club', clubId, { revision: 1, website: 'javascript:alert(1)' }),
    ).rejects.toMatchObject({ status: 400 });
    await federation.save('club', clubId, { revision: 1, imageBase64: picture });
    await expect(
      manager.save('club', clubId, { revision: 2, removeImage: true }),
    ).rejects.toMatchObject({ status: 403 });
    await manager.save('club', clubId, { revision: 2, description: 'Local presentation' });
    expect((await manager.raw('club', clubId))?.imageSource).toBe('federation');
    const profile = await federation.save('organization', federationId, {
      revision: 0,
      primaryColor: '#123456',
      accentColor: '#eeeeff',
      displayName: 'Federal identity',
    });
    expect((await manager.contextProfiles()).items).toContainEqual(
      expect.objectContaining({ kind: 'organization', primaryColor: '#123456', canEdit: false }),
    );
    expect(profile.revision).toBe(1);
    const refereeId = (await app.repositories.referees.list())[0].id,
      referee = new Profiles(app, {
        actorId: randomUUID(),
        roles: ['referee'],
        refereeIds: [refereeId],
      });
    const portrait = await referee.save('referee', refereeId, {
      revision: 0,
      imageBase64: picture,
    });
    expect(portrait.imageUrl).toBeTruthy();
    await expect(manager.getProfile('referee', refereeId)).rejects.toMatchObject({ status: 403 });
    const router = createRestApiRouter(app);
    expect(
      (
        await router.handle({
          method: 'GET',
          path: '/api/v1/platform/profiles/context',
          query: {},
          headers: {},
        })
      ).status,
    ).toBe(401);
    const readiness = await router.handle({
      method: 'GET',
      path: '/api/v1/platform/readiness',
      query: {},
      headers: {},
      auth: federation.auth,
    });
    expect(readiness.status).toBe(200);
    expect(readiness.body).toMatchObject({
      platformAdminConfigured: false,
      resultArchiveIndex: null,
    });
    expect(
      (
        await router.handle({
          method: 'GET',
          path: '/api/v1/platform/readiness',
          query: {},
          headers: {},
          auth: manager.auth,
        })
      ).status,
    ).toBe(403);
  } finally {
    await app.store.close();
  }
});
it('lets the arbitrating organization manage its identity without granting sports-federation control', async () => {
  const app = await preparedApp(),
    root = new Imports(app, {
      actorId: randomUUID(),
      roles: ['federation'],
      federationIds: [dataset.federationSyncPayload.federations[0].id],
    });
  try {
    const org = await root.create({ name: 'Arbitrating section', kind: 'refereeing' }),
      profiles = new Profiles(app, root.auth);
    await profiles.save('organization', org.id, {
      revision: 0,
      displayName: 'Sezione arbitri',
      primaryColor: '#112233',
    });
    expect((await profiles.getProfile('organization', org.id)).displayName).toBe('Sezione arbitri');
  } finally {
    await app.store.close();
  }
});
