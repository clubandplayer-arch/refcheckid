import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/index.js';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { authHeaders, ids, match, matchSheet } from '../test-fixtures.js';

describe('integration: frontend to REST API to backend repositories', () => {
  it('executes the main match sheet, recognition, report, and federation read flow', async () => {
    const container = createApplicationContainer();
    await container.repositories.matches.upsert(match());
    await container.repositories.matchSheets.upsert(matchSheet(ids.homeSheet, ids.homeClub));
    await container.repositories.matchSheets.upsert(matchSheet(ids.awaySheet, ids.awayClub));
    await container.repositories.players.upsert({
      id: '70000000-0000-4000-8000-000000000201',
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
    await container.repositories.registrations.upsert({
      id: '70000000-0000-4000-8000-000000000202',
      playerId: '70000000-0000-4000-8000-000000000201',
      clubId: ids.homeClub,
      season: '2026',
      registrationNumber: 'QA-1',
      status: 'active',
      registeredAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    });
    await container.repositories.photoSubjects.create({
      id: '70000000-0000-4000-8000-000000000203',
      subjectKind: 'athlete',
      canonicalPersonId: '70000000-0000-4000-8000-000000000201',
      dedupeKeyHash: null,
    });
    await container.repositories.globalOfficialPhotos.create({
      id: '70000000-0000-4000-8000-000000000204',
      photoSubjectId: '70000000-0000-4000-8000-000000000203',
      currentVersionId: '70000000-0000-4000-8000-000000000205',
      status: 'active',
      lastApprovedAt: '2026-07-01T00:00:00.000Z',
      lastChangedAt: '2026-07-01T00:00:00.000Z',
    });
    await container.repositories.photoVersions.create({
      id: '70000000-0000-4000-8000-000000000205',
      globalOfficialPhotoId: '70000000-0000-4000-8000-000000000204',
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
    await container.repositories.seasonRegistrationPhotos.create({
      id: '70000000-0000-4000-8000-000000000206',
      federationId: ids.federation,
      disciplineId: null,
      seasonId: '2026',
      registrationId: '70000000-0000-4000-8000-000000000202',
      photoSubjectId: '70000000-0000-4000-8000-000000000203',
      globalOfficialPhotoId: '70000000-0000-4000-8000-000000000204',
      effectiveVersionId: '70000000-0000-4000-8000-000000000205',
      approvalId: null,
      status: 'valid',
      validFrom: '2026-07-01T00:00:00.000Z',
      validUntil: null,
    });
    const router = createRestApiRouter(container);

    await expect(router.handle({ method: 'GET', path: '/api/v1/matches', headers: authHeaders, query: {} })).resolves.toMatchObject({ status: 200 });
    await expect(router.handle({
      method: 'POST',
      path: `/api/v1/match-sheets/${ids.homeSheet}/submit`,
      headers: authHeaders,
      query: {},
      body: {
        players: [
          {
            playerRegistrationId: '70000000-0000-4000-8000-000000000202',
            role: 'starter',
            shirtNumber: 9,
          },
        ],
      },
    })).resolves.toMatchObject({ status: 200, body: { status: 'submitted' } });
    await router.handle({ method: 'POST', path: `/api/v1/match-sheets/${ids.homeSheet}/lock`, headers: authHeaders, query: {} });
    await router.handle({ method: 'POST', path: `/api/v1/match-sheets/${ids.awaySheet}/lock`, headers: authHeaders, query: {} });
    await expect(router.handle({ method: 'POST', path: '/api/v1/recognitions/start', headers: authHeaders, query: {}, body: { matchId: ids.match } })).resolves.toMatchObject({ status: 200, body: { status: 'in_progress' } });
    await router.handle({ method: 'POST', path: '/api/v1/recognitions/complete', headers: authHeaders, query: {}, body: { matchId: ids.match } });
    await router.handle({ method: 'POST', path: `/api/v1/matches/${ids.match}/status`, headers: authHeaders, query: {}, body: { status: 'in_progress' } });
    await router.handle({ method: 'POST', path: `/api/v1/matches/${ids.match}/status`, headers: authHeaders, query: {}, body: { status: 'completed' } });
    const created = await router.handle({ method: 'POST', path: '/api/v1/match-reports', headers: authHeaders, query: {}, body: { matchId: ids.match, refereeId: ids.referee, summary: 'Gara regolare.' } });
    expect(created).toMatchObject({ status: 201, body: { matchId: ids.match, summary: 'Gara regolare.' } });
    const reportId = (created.body as { id: string }).id;
    await expect(router.handle({ method: 'POST', path: `/api/v1/match-reports/${reportId}/submit`, headers: authHeaders, query: {} })).resolves.toMatchObject({ status: 200, body: { status: 'submitted' } });
    await expect(router.handle({ method: 'GET', path: '/api/v1/match-reports', headers: authHeaders, query: { matchId: ids.match } })).resolves.toMatchObject({ status: 200, body: { id: reportId } });
  });
});
