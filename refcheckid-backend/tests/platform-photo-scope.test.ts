import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { preparedApp, dataset } from './runtime-fixtures.js';
import { createRestApiRouter } from '../src/api/router.js';
import { PlatformStore } from '../src/platform/store.js';
import type { Membership, Organization, Unit } from '../src/platform/types.js';
import type { AuthContext } from '../src/api/http.js';
it('confines territorial photo reviewers, denies an unscoped federation account and applies revocation to both approval APIs', async () => {
  const app = await preparedApp();
  const router = createRestApiRouter(app),
    db = new PlatformStore(app.store);
  const federationId = dataset.federationSyncPayload.federations[0].id,
    homeId = dataset.federationSyncPayload.clubs[0].id,
    awayId = dataset.federationSyncPayload.clubs[1].id;
  const root: AuthContext = {
    actorId: randomUUID(),
    roles: ['federation'],
    federationIds: [federationId],
  };
  const reviewer: AuthContext = { actorId: randomUUID(), roles: ['federation'], federationIds: [] };
  const call = (method: 'GET' | 'POST', path: string, body?: unknown, auth = root) =>
    router.handle({
      method,
      path: `/api/v1/${path}`,
      headers: {},
      query: {},
      ...(body ? { body } : {}),
      auth,
    });
  try {
    const org = (
      await call('POST', 'platform/organizations', {
        name: 'Scoped federation',
        kind: 'sports',
        federationId,
      })
    ).body as Organization;
    const unit = (
      await call('POST', 'platform/units', {
        organizationId: org.id,
        parentId: org.rootUnitId,
        name: 'Provincia A',
        kind: 'provincial',
      })
    ).body as Unit;
    await call('POST', 'platform/clubs', {
      organizationId: org.id,
      unitId: unit.id,
      code: 'HOME',
      name: 'Home',
      existingClubId: homeId,
    });
    const memberships = await db.put<Membership>('memberships', {
      organizationId: org.id,
      unitId: unit.id,
      actorId: reviewer.actorId,
      role: 'photo_reviewer',
      active: true,
      descendants: false,
    });
    const ids: string[] = [];
    for (const clubId of [homeId, awayId]) {
      const registration = (await app.repositories.registrations.listByClub(clubId))[0];
      const global = await app.repositories.globalOfficialPhotos.create({
        photoSubjectId: randomUUID(),
        currentVersionId: null,
        status: 'pending_first_approval',
        lastApprovedAt: null,
        lastChangedAt: new Date().toISOString(),
      });
      const version = await app.repositories.photoVersions.create({
        globalOfficialPhotoId: global.id,
        versionNumber: 1,
        status: 'pending_approval',
        activatedAt: null,
      });
      const row = await app.repositories.photoApprovals.create({
        federationId,
        photoVersionId: version.id,
        registrationId: registration.id,
        seasonId: '2026',
        status: 'pending',
        requestedAt: new Date().toISOString(),
        deletedAt: null,
      });
      ids.push(row.id);
    }
    const list = await call('GET', 'photo-approvals/page', undefined, reviewer);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect((list.body as { items: { id: string }[] }).items.map((row) => row.id)).toEqual([ids[0]]);
    expect((await call('GET', `photo-approvals/${ids[1]}`, undefined, reviewer)).status).toBe(403);
    expect((await call('POST', `photo-approvals/${ids[1]}/approve`, {}, reviewer)).status).toBe(
      403,
    );
    expect(
      (
        await call('GET', 'photo-approvals', undefined, {
          actorId: randomUUID(),
          roles: ['federation'],
          federationIds: [],
        })
      ).status,
    ).toBe(403);
    const decision = await call(
      'POST',
      `photo-approvals/${ids[0]}/reject`,
      { reasonCode: 'quality_issue', notes: 'La foto non consente il riconoscimento del volto' },
      reviewer,
    );
    expect(decision.status, JSON.stringify(decision.body)).toBe(200);
    expect((await call('POST', `platform/memberships/${memberships.id}/revoke`, {})).status).toBe(
      200,
    );
    expect((await call('GET', 'photo-approvals/page', undefined, reviewer)).status).toBe(403);
    expect((await call('GET', 'photo-approvals', undefined, reviewer)).status).toBe(403);
  } finally {
    await app.store.close();
  }
});
