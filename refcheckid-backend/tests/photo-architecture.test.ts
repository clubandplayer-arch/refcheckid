import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createOpenApiDocument, createRestApiRouter } from '../src/api/index.js';
import { createApplicationContainer } from '../src/config/application-container.js';
import type { PhotoApproval, PhotoVersion, SeasonRegistrationPhoto } from '../src/domain/index.js';
import {
  InvalidPhotoStateTransitionError,
  PhotoAuthorizationError,
} from '../src/services/index.js';

const now = '2026-07-10T00:00:00.000Z';
const ids = {
  user: '10000000-0000-4000-8000-000000000001',
  subject: '10000000-0000-4000-8000-000000000002',
  globalPhoto: '10000000-0000-4000-8000-000000000003',
  versionA: '10000000-0000-4000-8000-000000000004',
  versionB: '10000000-0000-4000-8000-000000000005',
  federationA: '10000000-0000-4000-8000-000000000006',
  federationB: '10000000-0000-4000-8000-000000000007',
  clubA: '10000000-0000-4000-8000-000000000008',
  clubB: '10000000-0000-4000-8000-000000000009',
  registrationA: '10000000-0000-4000-8000-000000000010',
  registrationB: '10000000-0000-4000-8000-000000000011',
  seasonPhotoA: '10000000-0000-4000-8000-000000000012',
  approval: '10000000-0000-4000-8000-000000000013',
  matchSheet: '10000000-0000-4000-8000-000000000014',
  match: '10000000-0000-4000-8000-000000000015',
  correlation: '10000000-0000-4000-8000-000000000016',
};

function photoVersion(
  overrides: Partial<PhotoVersion> = {},
): Omit<PhotoVersion, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    globalOfficialPhotoId: ids.globalPhoto,
    versionNumber: 1,
    uploadedByUserId: ids.user,
    uploadedByRole: 'manager',
    uploadedByClubId: ids.clubA,
    originFederationId: ids.federationA,
    originSeasonId: '2026',
    storageOriginalKey: `subjects/${ids.subject}/versions/${overrides.versionNumber ?? 1}/original`,
    storageNormalizedKey: null,
    mimeType: 'image/jpeg',
    normalizedMimeType: null,
    fileSizeBytes: 1024,
    width: 512,
    height: 512,
    sha256: `sha-${overrides.versionNumber ?? 1}`,
    perceptualHash: null,
    exifStripped: true,
    avScanStatus: 'clean',
    validationStatus: 'valid',
    status: 'uploaded',
    activatedAt: null,
    supersededAt: null,
    archivedAt: null,
    rejectionReasonCode: null,
    rejectionNotes: null,
    ...overrides,
  };
}

function seasonPhoto(
  overrides: Partial<SeasonRegistrationPhoto> = {},
): Omit<SeasonRegistrationPhoto, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    federationId: ids.federationA,
    disciplineId: null,
    seasonId: '2026',
    registrationId: ids.registrationA,
    photoSubjectId: ids.subject,
    globalOfficialPhotoId: ids.globalPhoto,
    effectiveVersionId: ids.versionA,
    approvalId: null,
    status: 'valid',
    validFrom: now,
    validUntil: null,
    ...overrides,
  };
}

function approval(
  overrides: Partial<PhotoApproval> = {},
): Omit<PhotoApproval, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    photoVersionId: ids.versionA,
    federationId: ids.federationA,
    disciplineId: null,
    seasonId: '2026',
    registrationId: ids.registrationA,
    requestedByUserId: ids.user,
    requestedAt: now,
    decidedByUserId: null,
    decidedAt: null,
    status: 'pending',
    decisionReasonCode: null,
    decisionNotes: null,
    scope: 'single_registration',
    slaDueAt: null,
    ...overrides,
  };
}

const authHeaders = {
  authorization:
    'Bearer eyJzdWIiOiI5MDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJlbWFpbCI6ImRpcmlnZW50ZUByZWZjaGVja2lkLmxvY2FsIiwicm9sZSI6Im1hbmFnZXIiLCJleHAiOjQxMDI0NDQ4MDAsInR5cCI6ImFjY2VzcyJ9.4HgrL-P9ZoeX9RL900wAjtIBQLv-MkMV9jVz_t5ceaE',
};

describe('ARCH-1 photo backend foundations', () => {
  it('publishes ARCH-1 Milestone B API workflows', async () => {
    const document = createOpenApiDocument();
    expect(document.paths['/api/v1/players/{id}/photo']).toBeDefined();
    expect(document.paths['/api/v1/registrations/{id}/season-photo']).toBeDefined();
    expect(document.paths['/api/v1/match-sheets/{id}/photo-snapshots']).toBeDefined();

    const router = createRestApiRouter(createApplicationContainer());
    await expect(
      router.handle({
        method: 'GET',
        path: `/api/v1/players/${ids.registrationA}/photo`,
        headers: authHeaders,
        query: {},
      }),
    ).resolves.toMatchObject({ status: 404, body: { error: 'PHOTO_NOT_FOUND' } });
    await expect(
      router.handle({
        method: 'POST',
        path: '/api/v1/photos/upload-intent',
        headers: authHeaders,
        query: {},
        body: {
          playerId: '90000000-0000-4000-8000-000000000001',
          registrationId: '90000000-0000-4000-8000-000000000002',
          federationId: '90000000-0000-4000-8000-000000000003',
          seasonId: '2026',
          mimeType: 'image/jpeg',
          fileSizeBytes: 100,
          sha256: 'sha',
          actorRole: 'admin',
        },
      }),
    ).resolves.toMatchObject({ status: 202, body: { intent: { method: 'PUT' } } });
  });

  it('declares non-destructive migration schema, constraints and indexes', () => {
    const sql = readFileSync(
      join(process.cwd(), 'database/migrations/0018_create_arch1_photo_model.sql'),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE photo_subjects');
    expect(sql).toContain('CREATE TABLE global_official_photos');
    expect(sql).toContain('CREATE TABLE season_registration_photos');
    expect(sql).toContain('CREATE TABLE match_sheet_photo_snapshots');
    expect(sql).toContain('uq_photo_versions_one_active_per_global_photo');
    expect(sql).toContain('uq_photo_approvals_one_pending_registration');
    expect(sql).not.toContain('DROP TABLE photos');
  });

  it('enforces the central photo version state machine', async () => {
    const container = createApplicationContainer();
    const created = await container.services.photos.createPhotoVersion(photoVersion());

    const validating = await container.services.photos.transitionPhotoVersion(
      created.id,
      'validating',
    );
    expect(validating.status).toBe('validating');
    await container.services.photos.transitionPhotoVersion(created.id, 'pending_approval');
    await container.services.photos.transitionPhotoVersion(created.id, 'active');
    await container.services.photos.transitionPhotoVersion(created.id, 'superseded');
    await expect(
      container.services.photos.transitionPhotoVersion(created.id, 'active'),
    ).rejects.toBeInstanceOf(InvalidPhotoStateTransitionError);
    const archived = await container.services.photos.transitionPhotoVersion(created.id, 'archived');
    expect(archived.status).toBe('archived');
  });

  it('enforces one active global version and allows reuse across seasonal registrations', async () => {
    const container = createApplicationContainer();
    await container.services.photos.createGlobalOfficialPhoto({
      photoSubjectId: ids.subject,
      currentVersionId: ids.versionA,
      status: 'active',
      lastApprovedAt: now,
      lastChangedAt: now,
    });
    await container.services.photos.createPhotoVersion(photoVersion({ status: 'active' }));

    await expect(
      container.services.photos.createPhotoVersion(
        photoVersion({
          versionNumber: 2,
          sha256: 'sha-2',
          storageOriginalKey: 'subjects/s/v2/original',
          status: 'active',
        }),
      ),
    ).rejects.toThrow('Only one active photo version');

    const first = await container.services.photos.createSeasonRegistrationPhoto(seasonPhoto());
    const reused = await container.services.photos.createSeasonRegistrationPhoto(
      seasonPhoto({
        federationId: ids.federationB,
        registrationId: ids.registrationB,
        effectiveVersionId: first.effectiveVersionId,
      }),
    );
    expect(reused.effectiveVersionId).toBe(first.effectiveVersionId);
  });

  it('enforces one pending approval per registration and season', async () => {
    const container = createApplicationContainer();
    await container.services.photos.createPendingApproval(approval());
    await expect(
      container.services.photos.createPendingApproval(approval({ photoVersionId: ids.versionB })),
    ).rejects.toThrow('Only one pending photo approval');
  });

  it('keeps frozen match snapshots immutable per match sheet registration', async () => {
    const container = createApplicationContainer();
    const snapshot = await container.services.photos.createMatchSheetPhotoSnapshot({
      matchSheetId: ids.matchSheet,
      matchId: ids.match,
      registrationId: ids.registrationA,
      seasonRegistrationPhotoId: ids.seasonPhotoA,
      photoSubjectId: ids.subject,
      globalOfficialPhotoId: ids.globalPhoto,
      photoVersionId: ids.versionA,
      photoEtag: 'sha256:version-a',
      renditionManifest: { thumb320: 'subjects/s/v/a/thumb_320.webp' },
      frozenAt: now,
      frozenByUserId: ids.user,
      freezeReason: 'match_sheet_locked',
      auditCorrelationId: ids.correlation,
    });

    await expect(
      container.services.photos.createMatchSheetPhotoSnapshot({
        ...snapshot,
        photoEtag: 'sha256:changed',
      }),
    ).rejects.toThrow('immutable');
  });

  it('isolates federations and managers through seasonal registration context', async () => {
    const container = createApplicationContainer();
    const scopedPhoto =
      await container.services.photos.createSeasonRegistrationPhoto(seasonPhoto());

    await expect(
      container.services.photos.assertCanAccessSeasonRegistrationPhoto(
        { actorRole: 'federation', actorId: ids.user, federationId: ids.federationB },
        scopedPhoto,
      ),
    ).rejects.toBeInstanceOf(PhotoAuthorizationError);

    await expect(
      container.services.photos.assertCanAccessSeasonRegistrationPhoto(
        {
          actorRole: 'manager',
          actorId: ids.user,
          clubId: ids.clubB,
          registrationClubId: ids.clubA,
        },
        scopedPhoto,
      ),
    ).rejects.toBeInstanceOf(PhotoAuthorizationError);

    await expect(
      container.services.photos.assertCanAccessSeasonRegistrationPhoto(
        { actorRole: 'federation', actorId: ids.user, federationId: ids.federationA },
        scopedPhoto,
      ),
    ).resolves.toBeUndefined();
  });
});
