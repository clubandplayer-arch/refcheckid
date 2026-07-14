import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/index.js';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { authHeaders, ids } from '../test-fixtures.js';

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

  it('does not trust client supplied actorRole or club scope for photo uploads', async () => {
    const container = createApplicationContainer();
    const router = createRestApiRouter(container);
    await container.repositories.registrations.upsert({
      id: '62000000-0000-4000-8000-000000000001',
      playerId: '62000000-0000-4000-8000-000000000011',
      clubId: ids.awayClub,
      season: '2026',
      registrationNumber: 'AWAY-SPOOF',
      status: 'active',
      registeredAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });

    await expect(
      router.handle({
        method: 'POST',
        path: '/api/v1/photos/upload-intent',
        headers: {},
        auth: { actorId: ids.actor, roles: ['manager'], clubIds: [ids.homeClub] },
        query: {},
        body: {
          playerId: '62000000-0000-4000-8000-000000000011',
          registrationId: '62000000-0000-4000-8000-000000000001',
          federationId: ids.federation,
          seasonId: '2026',
          mimeType: 'image/png',
          fileSizeBytes: 68,
          sha256: 'sha',
          actorRole: 'admin',
          clubId: ids.awayClub,
          registrationClubId: ids.awayClub,
        },
      }),
    ).resolves.toMatchObject({ status: 409, body: { error: 'PhotoAuthorizationError' } });
  });

  it('does not issue signed URLs through the content route without a verifiable relation', async () => {
    const container = createApplicationContainer();
    const subject = await container.repositories.photoSubjects.create({
      subjectKind: 'athlete',
      canonicalPersonId: '63000000-0000-4000-8000-000000000001',
      dedupeKeyHash: '63000000-0000-4000-8000-000000000001',
    });
    const global = await container.repositories.globalOfficialPhotos.create({
      photoSubjectId: subject.id,
      currentVersionId: null,
      status: 'active',
      lastApprovedAt: '2026-07-01T00:00:00.000Z',
      lastChangedAt: '2026-07-01T00:00:00.000Z',
    });
    const version = await container.services.photos.createPhotoVersion({
      globalOfficialPhotoId: global.id,
      versionNumber: 1,
      uploadedByUserId: ids.actor,
      uploadedByRole: 'manager',
      uploadedByClubId: ids.homeClub,
      originFederationId: ids.federation,
      originSeasonId: '2026',
      storageOriginalKey: 'subjects/orphan/original.png',
      storageNormalizedKey: 'subjects/orphan/normalized.png',
      mimeType: 'image/png',
      normalizedMimeType: 'image/png',
      fileSizeBytes: 68,
      width: 1,
      height: 1,
      sha256: 'sha',
      perceptualHash: null,
      exifStripped: true,
      avScanStatus: 'clean',
      validationStatus: 'valid',
      status: 'active',
      activatedAt: '2026-07-01T00:00:00.000Z',
      supersededAt: null,
      archivedAt: null,
      rejectionReasonCode: null,
      rejectionNotes: null,
    });
    const router = createRestApiRouter(container);

    await expect(
      router.handle({
        method: 'GET',
        path: `/api/v1/photos/versions/${version.id}/content`,
        headers: {},
        auth: { actorId: ids.actor, roles: ['manager'], clubIds: [ids.homeClub] },
        query: {},
      }),
    ).resolves.toMatchObject({ status: 409, body: { error: 'PhotoAuthorizationError' } });
  });
});
