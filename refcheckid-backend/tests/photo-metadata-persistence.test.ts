import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GlobalOfficialPhotoRepository,
  PhotoSubjectRepository,
  PhotoVersionRepository,
  SeasonRegistrationPhotoRepository,
} from '../src/repositories/photos-repository.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('photo metadata persistence', () => {
  it('restores an approved registration photo after repository reconstruction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'refcheckid-photo-metadata-'));
    temporaryRoots.push(root);

    const subjectId = '70000000-0000-4000-8000-000000000203';
    const globalPhotoId = '70000000-0000-4000-8000-000000000204';
    const versionId = '70000000-0000-4000-8000-000000000205';
    const registrationPhotoId = '70000000-0000-4000-8000-000000000206';

    await new PhotoSubjectRepository([], root).create({
      id: subjectId,
      subjectKind: 'athlete',
      canonicalPersonId: '70000000-0000-4000-8000-000000000201',
      dedupeKeyHash: null,
    });
    await new GlobalOfficialPhotoRepository([], root).create({
      id: globalPhotoId,
      photoSubjectId: subjectId,
      currentVersionId: versionId,
      status: 'active',
      lastApprovedAt: '2026-08-07T00:00:00.000Z',
      lastChangedAt: '2026-08-07T00:00:00.000Z',
    });
    await new PhotoVersionRepository([], root).create({
      id: versionId,
      globalOfficialPhotoId: globalPhotoId,
      versionNumber: 1,
      uploadedByUserId: '70000000-0000-4000-8000-000000000001',
      uploadedByRole: 'manager',
      uploadedByClubId: '70000000-0000-4000-8000-000000000003',
      originFederationId: '70000000-0000-4000-8000-000000000002',
      originSeasonId: '2026',
      storageOriginalKey: 'approved/original.png',
      storageNormalizedKey: 'approved/normalized.png',
      mimeType: 'image/png',
      normalizedMimeType: 'image/png',
      fileSizeBytes: 10,
      width: 10,
      height: 10,
      sha256: 'sha256:persisted-version',
      perceptualHash: null,
      exifStripped: true,
      avScanStatus: 'clean',
      validationStatus: 'valid',
      status: 'active',
      activatedAt: '2026-08-07T00:00:00.000Z',
      supersededAt: null,
      archivedAt: null,
      rejectionReasonCode: null,
      rejectionNotes: null,
    });
    await new SeasonRegistrationPhotoRepository([], root).create({
      id: registrationPhotoId,
      federationId: '70000000-0000-4000-8000-000000000002',
      disciplineId: null,
      seasonId: '2026',
      registrationId: '70000000-0000-4000-8000-000000000202',
      photoSubjectId: subjectId,
      globalOfficialPhotoId: globalPhotoId,
      effectiveVersionId: versionId,
      approvalId: null,
      status: 'valid',
      validFrom: '2026-08-07T00:00:00.000Z',
      validUntil: null,
    });

    await expect(new PhotoSubjectRepository([], root).findById(subjectId)).resolves.toMatchObject({
      id: subjectId,
      subjectKind: 'athlete',
    });
    await expect(
      new GlobalOfficialPhotoRepository([], root).findById(globalPhotoId),
    ).resolves.toMatchObject({
      currentVersionId: versionId,
      status: 'active',
    });
    await expect(new PhotoVersionRepository([], root).findById(versionId)).resolves.toMatchObject({
      storageNormalizedKey: 'approved/normalized.png',
      status: 'active',
    });
    await expect(
      new SeasonRegistrationPhotoRepository([], root).findById(registrationPhotoId),
    ).resolves.toMatchObject({
      effectiveVersionId: versionId,
      registrationId: '70000000-0000-4000-8000-000000000202',
      status: 'valid',
    });
  });
});
