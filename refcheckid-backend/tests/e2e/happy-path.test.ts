import { describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { ids, match, matchSheet } from '../test-fixtures.js';

describe('e2e happy path: manager, referee, federation', () => {
  it('allows the manager to submit lineups, referee to recognize and report, federation to receive report', async () => {
    const app = createApplicationContainer();
    await app.repositories.matches.upsert(match({ status: 'scheduled' }));
    await app.repositories.matchSheets.upsert(matchSheet(ids.homeSheet, ids.homeClub));
    await app.repositories.matchSheets.upsert(matchSheet(ids.awaySheet, ids.awayClub));
    await app.repositories.players.upsert({
      id: '70000000-0000-4000-8000-000000000101',
      federationId: ids.federation,
      firstName: 'Mario',
      lastName: 'Rossi',
      birthDate: '2000-01-01',
      birthPlace: null,
      fiscalCode: null,
      status: 'active',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });
    await app.repositories.registrations.upsert({
      id: '70000000-0000-4000-8000-000000000102',
      playerId: '70000000-0000-4000-8000-000000000101',
      clubId: ids.homeClub,
      season: '2026',
      registrationNumber: 'QA-1',
      status: 'active',
      registeredAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });
    await app.repositories.players.upsert({
      id: '70000000-0000-4000-8000-000000000107',
      federationId: ids.federation,
      firstName: 'Luigi',
      lastName: 'Bianchi',
      birthDate: '2001-01-01',
      birthPlace: null,
      fiscalCode: null,
      status: 'active',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });
    await app.repositories.registrations.upsert({
      id: '70000000-0000-4000-8000-000000000108',
      playerId: '70000000-0000-4000-8000-000000000107',
      clubId: ids.homeClub,
      season: '2026',
      registrationNumber: 'QA-2',
      status: 'active',
      registeredAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });
    await app.repositories.registrations.syncStaffMember({
      id: '70000000-0000-4000-8000-000000000109',
      federationId: ids.federation,
      firstName: 'Anna',
      lastName: 'Verdi',
      birthDate: null,
      fiscalCode: null,
      status: 'active',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });
    await app.repositories.registrations.syncStaffRegistration({
      id: '70000000-0000-4000-8000-000000000110',
      staffMemberId: '70000000-0000-4000-8000-000000000109',
      clubId: ids.homeClub,
      season: '2026',
      role: 'Allenatore',
      registrationNumber: 'QA-S1',
      status: 'active',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });
    await app.repositories.photoSubjects.create({
      id: '70000000-0000-4000-8000-000000000103',
      subjectKind: 'athlete',
      canonicalPersonId: '70000000-0000-4000-8000-000000000101',
      dedupeKeyHash: null,
    });
    await app.repositories.globalOfficialPhotos.create({
      id: '70000000-0000-4000-8000-000000000104',
      photoSubjectId: '70000000-0000-4000-8000-000000000103',
      currentVersionId: '70000000-0000-4000-8000-000000000105',
      status: 'active',
      lastApprovedAt: '2026-07-01T00:00:00.000Z',
      lastChangedAt: '2026-07-01T00:00:00.000Z',
    });
    await app.repositories.photoVersions.create({
      id: '70000000-0000-4000-8000-000000000105',
      globalOfficialPhotoId: '70000000-0000-4000-8000-000000000104',
      versionNumber: 1,
      uploadedByUserId: ids.actor,
      uploadedByRole: 'manager',
      uploadedByClubId: ids.homeClub,
      originFederationId: ids.federation,
      originSeasonId: '2026',
      storageOriginalKey: 'qa/original.png',
      storageNormalizedKey: 'qa/normalized.png',
      mimeType: 'image/png',
      normalizedMimeType: 'image/png',
      fileSizeBytes: 10,
      width: 10,
      height: 10,
      sha256: 'sha256:qa-version',
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
    await app.repositories.seasonRegistrationPhotos.create({
      id: '70000000-0000-4000-8000-000000000106',
      federationId: ids.federation,
      disciplineId: null,
      seasonId: '2026',
      registrationId: '70000000-0000-4000-8000-000000000102',
      photoSubjectId: '70000000-0000-4000-8000-000000000103',
      globalOfficialPhotoId: '70000000-0000-4000-8000-000000000104',
      effectiveVersionId: '70000000-0000-4000-8000-000000000105',
      approvalId: null,
      status: 'valid',
      validFrom: '2026-07-01T00:00:00.000Z',
      validUntil: null,
    });

    await app.services.matchSheets.submitMatchSheet(ids.homeSheet, {
      players: [
        {
          playerRegistrationId: '70000000-0000-4000-8000-000000000102',
          role: 'starter',
          shirtNumber: 9,
        },
        {
          playerRegistrationId: '70000000-0000-4000-8000-000000000108',
          role: 'bench',
          shirtNumber: 18,
        },
      ],
      staff: [
        {
          staffRegistrationId: '70000000-0000-4000-8000-000000000110',
          role: 'Allenatore',
        },
      ],
    });
    await app.services.matchSheets.lockMatchSheet(ids.homeSheet);
    await expect(app.services.photos.listMatchSheetPhotoSnapshots(ids.homeSheet)).resolves.toHaveLength(3);
    const manifest = await app.services.photos.listMatchSheetPhotoSnapshots(ids.homeSheet);
    expect(manifest.map((snapshot) => snapshot.photoStatus).sort()).toEqual([
      'active',
      'missing',
      'missing',
    ]);
    await app.services.matchSheets.lockMatchSheet(ids.awaySheet);
    await expect(app.services.recognitions.startRecognition(ids.match)).resolves.toMatchObject({ status: 'in_progress' });
    await expect(app.services.recognitions.completeRecognition(ids.match)).resolves.toMatchObject({ status: 'locked' });
    await app.services.matches.transitionMatchStatus(ids.match, 'in_progress');
    await app.services.matches.transitionMatchStatus(ids.match, 'completed');
    const report = await app.services.matchReports.createMatchReport({ matchId: ids.match, refereeId: ids.referee, summary: 'Referto completo.' });
    await app.services.matchReports.submitMatchReport(report.id);

    await expect(app.services.matchReports.getMatchReportByMatch(ids.match)).resolves.toMatchObject({ status: 'submitted', summary: 'Referto completo.' });
  });
});
