import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../src/api/index.js';
import { createApplicationContainer } from '../src/config/application-container.js';
import type { PhotoApproval, PhotoVersion } from '../src/domain/index.js';

const ids = {
  actor: '20000000-0000-4000-8000-000000000001',
  subject: '20000000-0000-4000-8000-000000000002',
  global: '20000000-0000-4000-8000-000000000003',
  current: '20000000-0000-4000-8000-000000000004',
  proposed: '20000000-0000-4000-8000-000000000005',
  federation: '20000000-0000-4000-8000-000000000006',
  otherFederation: '20000000-0000-4000-8000-000000000007',
  registration: '20000000-0000-4000-8000-000000000008',
};

function version(
  overrides: Partial<PhotoVersion> = {},
  globalOfficialPhotoId = ids.global,
): Omit<PhotoVersion, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    globalOfficialPhotoId,
    versionNumber: 1,
    uploadedByUserId: ids.actor,
    uploadedByRole: 'manager',
    uploadedByClubId: null,
    originFederationId: ids.federation,
    originSeasonId: '2026',
    storageOriginalKey: `subjects/${ids.subject}/${overrides.versionNumber ?? 1}.jpg`,
    storageNormalizedKey: null,
    mimeType: 'image/jpeg',
    normalizedMimeType: null,
    fileSizeBytes: 100,
    width: 1,
    height: 1,
    sha256: `sha-${overrides.versionNumber ?? 1}`,
    perceptualHash: null,
    exifStripped: true,
    avScanStatus: 'clean',
    validationStatus: 'valid',
    status: 'pending_approval',
    activatedAt: null,
    supersededAt: null,
    archivedAt: null,
    rejectionReasonCode: null,
    rejectionNotes: null,
    ...overrides,
  };
}

function approval(
  photoVersionId = ids.proposed,
): Omit<PhotoApproval, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    photoVersionId,
    federationId: ids.federation,
    disciplineId: null,
    seasonId: '2026',
    registrationId: ids.registration,
    requestedByUserId: ids.actor,
    requestedAt: '2026-07-10T00:00:00.000Z',
    decidedByUserId: null,
    decidedAt: null,
    status: 'pending',
    decisionReasonCode: null,
    decisionNotes: null,
    scope: 'single_registration',
    slaDueAt: null,
  };
}

async function seeded() {
  const container = createApplicationContainer();
  await container.repositories.photoSubjects.create({
    subjectKind: 'athlete',
    canonicalPersonId: ids.actor,
    dedupeKeyHash: ids.actor,
  });
  const global = await container.repositories.globalOfficialPhotos.create({
    photoSubjectId: ids.subject,
    currentVersionId: null,
    status: 'pending_first_approval',
    lastApprovedAt: null,
    lastChangedAt: '2026-07-10T00:00:00.000Z',
  });
  const proposed = await container.services.photos.createPhotoVersion(version({}, global.id));
  const pending = await container.services.photos.createPendingApproval(approval(proposed.id));
  return { container, proposed, pending };
}

describe('ARCH-1 Milestone C federation approval workflow', () => {
  it('lists, filters and returns photo approval detail chronologically', async () => {
    const { container, pending } = await seeded();
    const router = createRestApiRouter(container);
    const list = await router.handle({
      method: 'GET',
      path: '/api/v1/photo-approvals',
      headers: { authorization: 'Bearer test' },
      auth: { actorId: ids.actor, roles: ['federation'] },
      query: { federationId: ids.federation, status: 'pending' },
    });
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject([{ id: pending.id, status: 'pending' }]);
    const detail = await router.handle({
      method: 'GET',
      path: `/api/v1/photo-approvals/${pending.id}`,
      headers: { authorization: 'Bearer test' },
      auth: { actorId: ids.actor, roles: ['federation'] },
      query: {},
    });
    expect(detail.body).toMatchObject({ id: pending.id });
  });

  it('approves first photo, updates lifecycle rows, audits and is idempotent', async () => {
    const { container, pending, proposed } = await seeded();
    const first = await container.services.photos.approvePhotoApproval({
      approvalId: pending.id,
      context: { actorRole: 'federation', actorId: ids.actor, federationId: ids.federation },
      reasonCode: 'identity_verified',
    });
    const second = await container.services.photos.approvePhotoApproval({
      approvalId: pending.id,
      context: { actorRole: 'federation', actorId: ids.actor, federationId: ids.federation },
    });
    expect(first.status).toBe('approved');
    expect(second.status).toBe('approved');
    expect(await container.repositories.photoVersions.findById(proposed.id)).toMatchObject({
      status: 'active',
    });
    expect((await container.repositories.globalOfficialPhotos.list())[0]).toMatchObject({
      currentVersionId: proposed.id,
      status: 'active',
    });
    expect((await container.repositories.seasonRegistrationPhotos.list())[0]).toMatchObject({
      effectiveVersionId: proposed.id,
      status: 'valid',
    });
    expect(
      (await container.repositories.photoAuditEvents.list()).some(
        (event) => event.eventType === 'photo.approved',
      ),
    ).toBe(true);
  });

  it('approves replacement and supersedes old active version', async () => {
    const { container, pending, proposed } = await seeded();
    const current = await container.services.photos.createPhotoVersion(
      version(
        {
          versionNumber: 0,
          status: 'active',
          activatedAt: '2026-01-01T00:00:00.000Z',
          storageOriginalKey: 'subjects/current.jpg',
        },
        proposed.globalOfficialPhotoId,
      ),
    );
    const global = (await container.repositories.globalOfficialPhotos.list())[0];
    await container.repositories.globalOfficialPhotos.update(global.id, {
      currentVersionId: current.id,
      status: 'active',
    });
    await container.services.photos.approvePhotoApproval({
      approvalId: pending.id,
      context: { actorRole: 'admin', actorId: ids.actor },
    });
    expect(await container.repositories.photoVersions.findById(current.id)).toMatchObject({
      status: 'superseded',
    });
    expect(await container.repositories.photoVersions.findById(proposed.id)).toMatchObject({
      status: 'active',
    });
  });

  it('rejects without changing old active photo and persists reason, notes and audit', async () => {
    const { container, pending, proposed } = await seeded();
    const current = await container.services.photos.createPhotoVersion(
      version(
        {
          versionNumber: 0,
          status: 'active',
          activatedAt: '2026-01-01T00:00:00.000Z',
          storageOriginalKey: 'subjects/current-reject.jpg',
        },
        proposed.globalOfficialPhotoId,
      ),
    );
    const global = (await container.repositories.globalOfficialPhotos.list())[0];
    await container.repositories.globalOfficialPhotos.update(global.id, {
      currentVersionId: current.id,
      status: 'active',
    });
    const rejected = await container.services.photos.rejectPhotoApproval({
      approvalId: pending.id,
      context: { actorRole: 'federation', actorId: ids.actor, federationId: ids.federation },
      reasonCode: 'face_not_visible',
      notes: 'Volto coperto',
    });
    expect(rejected).toMatchObject({
      status: 'rejected',
      decisionReasonCode: 'face_not_visible',
      decisionNotes: 'Volto coperto',
    });
    expect(await container.repositories.photoVersions.findById(proposed.id)).toMatchObject({
      status: 'rejected',
      rejectionReasonCode: 'face_not_visible',
    });
    expect((await container.repositories.globalOfficialPhotos.list())[0].currentVersionId).toBe(
      current.id,
    );
    expect(
      (await container.repositories.photoAuditEvents.list()).some(
        (event) => event.eventType === 'photo.rejected',
      ),
    ).toBe(true);
  });

  it('denies managers and other federations from approval decisions', async () => {
    const { container, pending } = await seeded();
    await expect(
      container.services.photos.approvePhotoApproval({
        approvalId: pending.id,
        context: { actorRole: 'manager', actorId: ids.actor },
      }),
    ).rejects.toThrow('Actor cannot decide');
    await expect(
      container.services.photos.approvePhotoApproval({
        approvalId: pending.id,
        context: { actorRole: 'federation', actorId: ids.actor, federationId: ids.otherFederation },
      }),
    ).rejects.toThrow('Actor cannot decide');
  });
});
