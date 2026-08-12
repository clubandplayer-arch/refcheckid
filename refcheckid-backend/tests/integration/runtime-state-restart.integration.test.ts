import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { pilotIds } from '../../src/config/pilot-data.js';
import type { UUID } from '../../src/domain/index.js';

const timestamp = '2026-08-12T12:00:00.000Z';
const ids = {
  homePlayer: '81000000-0000-4000-8000-000000000001',
  awayPlayer: '81000000-0000-4000-8000-000000000002',
  homeRegistration: '82000000-0000-4000-8000-000000000001',
  awayRegistration: '82000000-0000-4000-8000-000000000002',
  homeStaff: '83000000-0000-4000-8000-000000000001',
  awayStaff: '83000000-0000-4000-8000-000000000002',
  homeStaffRegistration: '84000000-0000-4000-8000-000000000001',
  awayStaffRegistration: '84000000-0000-4000-8000-000000000002',
} as const satisfies Record<string, UUID>;

describe('runtime state restart persistence', () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('restores the complete operational workflow without demo initialization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'refcheckid-restart-'));
    temporaryRoots.push(root);
    const options = {
      runtimeStateRoot: join(root, 'runtime'),
      photoMetadataRoot: join(root, 'photo-metadata'),
      photoStorageRoot: join(root, 'photo-objects'),
    };
    const containerA = createApplicationContainer(options);

    await containerA.repositories.federations.upsert(
      entity(pilotIds.federation, {
        name: 'Federazione restart',
        fiscalCode: null,
        status: 'active' as const,
      }),
    );
    await Promise.all([
      containerA.repositories.clubs.upsert(
        entity(pilotIds.homeClub, {
          federationId: pilotIds.federation,
          name: 'Home restart',
          fiscalCode: null,
          status: 'active' as const,
        }),
      ),
      containerA.repositories.clubs.upsert(
        entity(pilotIds.awayClub, {
          federationId: pilotIds.federation,
          name: 'Away restart',
          fiscalCode: null,
          status: 'active' as const,
        }),
      ),
      containerA.repositories.referees.upsert(
        entity(pilotIds.referee, {
          federationId: pilotIds.federation,
          firstName: 'Rita',
          lastName: 'Arbitro',
          fiscalCode: null,
          status: 'active' as const,
        }),
      ),
    ]);
    await Promise.all([
      containerA.repositories.players.upsert(entity(ids.homePlayer, player('Ada', 'Home'))),
      containerA.repositories.players.upsert(entity(ids.awayPlayer, player('Grace', 'Away'))),
      containerA.repositories.registrations.upsert(
        entity(ids.homeRegistration, registration(ids.homePlayer, pilotIds.homeClub, 'HOME-1')),
      ),
      containerA.repositories.registrations.upsert(
        entity(ids.awayRegistration, registration(ids.awayPlayer, pilotIds.awayClub, 'AWAY-1')),
      ),
      containerA.repositories.registrations.syncStaffMember(
        entity(ids.homeStaff, staff('Hedy', 'Home')),
      ),
      containerA.repositories.registrations.syncStaffMember(
        entity(ids.awayStaff, staff('Katherine', 'Away')),
      ),
      containerA.repositories.registrations.syncStaffRegistration(
        entity(
          ids.homeStaffRegistration,
          staffRegistration(ids.homeStaff, pilotIds.homeClub, 'HOME-S1'),
        ),
      ),
      containerA.repositories.registrations.syncStaffRegistration(
        entity(
          ids.awayStaffRegistration,
          staffRegistration(ids.awayStaff, pilotIds.awayClub, 'AWAY-S1'),
        ),
      ),
    ]);

    const homeSheet = await containerA.services.matchSheets.submitMatchSheet(pilotIds.homeSheet, {
      players: [
        {
          playerRegistrationId: ids.homeRegistration,
          shirtNumber: 1,
          role: 'starter',
          lineupOrder: 0,
          isGoalkeeper: true,
          isCaptain: true,
        },
      ],
      staff: [{ staffRegistrationId: ids.homeStaffRegistration, role: 'coach' }],
    });
    const awaySheet = await containerA.services.matchSheets.submitMatchSheet(pilotIds.awaySheet, {
      players: [
        {
          playerRegistrationId: ids.awayRegistration,
          shirtNumber: 9,
          role: 'starter',
          lineupOrder: 3,
          isViceCaptain: true,
        },
      ],
      staff: [{ staffRegistrationId: ids.awayStaffRegistration, role: 'coach' }],
    });
    await containerA.services.matchSheets.lockMatchSheet(homeSheet.id);
    await containerA.services.matchSheets.lockMatchSheet(awaySheet.id);
    await containerA.services.recognitions.startRecognition(pilotIds.match);

    const [homePlayer] = await containerA.repositories.matchSheetPlayers.listByMatchSheet(
      homeSheet.id,
    );
    const [awayStaff] = await containerA.repositories.matchSheetStaff.listByMatchSheet(
      awaySheet.id,
    );
    await Promise.all([
      containerA.repositories.recognitions.create({
        matchId: pilotIds.match,
        refereeId: pilotIds.referee,
        matchSheetPlayerId: homePlayer.id,
        matchSheetStaffId: null,
        recognizedAt: timestamp,
        status: 'recognized',
        notes: null,
      }),
      containerA.repositories.recognitions.create({
        matchId: pilotIds.match,
        refereeId: pilotIds.referee,
        matchSheetPlayerId: null,
        matchSheetStaffId: awayStaff.id,
        recognizedAt: timestamp,
        status: 'recognized',
        notes: null,
      }),
    ]);
    await containerA.services.recognitions.completeRecognition(pilotIds.match);
    await containerA.services.matches.transitionMatchStatus(pilotIds.match, 'in_progress');
    await containerA.services.matches.transitionMatchStatus(pilotIds.match, 'completed');
    await containerA.services.matchReports.updateMatchReport(pilotIds.report, {
      summary: JSON.stringify({ score: '2-1', goals: 3, cautions: 2, substitutions: 4 }),
    });
    await containerA.services.matchReports.submitMatchReport(pilotIds.report);
    await containerA.objectStores.photos.putObject?.(
      'restart/photo.jpg',
      Buffer.from('photo-bytes'),
    );

    const containerB = createApplicationContainer(options);
    await expect(
      containerB.repositories.federations.findById(pilotIds.federation),
    ).resolves.toMatchObject({ name: 'Federazione restart' });
    await expect(
      containerB.repositories.clubs.listByFederation(pilotIds.federation),
    ).resolves.toHaveLength(2);
    await expect(
      containerB.repositories.referees.findById(pilotIds.referee),
    ).resolves.toMatchObject({ firstName: 'Rita' });
    await expect(
      containerB.repositories.players.listByFederation(pilotIds.federation),
    ).resolves.toHaveLength(2);
    await expect(containerB.repositories.registrations.listStaffMembers()).resolves.toHaveLength(2);
    await expect(
      containerB.repositories.registrations.listStaffRegistrationsByClub(pilotIds.awayClub),
    ).resolves.toHaveLength(1);
    await expect(
      containerB.repositories.matchSheets.listByMatch(pilotIds.match),
    ).resolves.toMatchObject([{ status: 'locked' }, { status: 'locked' }]);
    await expect(
      containerB.repositories.matchSheetPlayers.listByMatchSheet(pilotIds.homeSheet),
    ).resolves.toMatchObject([
      { lineupOrder: 0, isGoalkeeper: true, isCaptain: true, isViceCaptain: false },
    ]);
    await expect(
      containerB.repositories.matchSheetPlayers.listByMatchSheet(pilotIds.awaySheet),
    ).resolves.toMatchObject([
      { lineupOrder: 3, isGoalkeeper: false, isCaptain: false, isViceCaptain: true },
    ]);
    await expect(
      containerB.repositories.matchSheetStaff.listByMatchSheet(pilotIds.homeSheet),
    ).resolves.toHaveLength(1);
    await expect(
      containerB.repositories.matchSheetPhotoSnapshots.listByMatchSheet(pilotIds.homeSheet),
    ).resolves.toHaveLength(2);
    await expect(
      containerB.repositories.matchSheetPhotoSnapshots.listByMatchSheet(pilotIds.awaySheet),
    ).resolves.toHaveLength(2);
    await expect(
      containerB.services.recognitions.startRecognition(pilotIds.match),
    ).resolves.toMatchObject({ status: 'locked' });
    await expect(
      containerB.services.recognitions.listRecognitionsByMatch(pilotIds.match),
    ).resolves.toHaveLength(2);
    const restoredReport = await containerB.services.matchReports.getMatchReportById(
      pilotIds.report,
    );
    expect(restoredReport).toMatchObject({ status: 'submitted' });
    expect(restoredReport?.summary).toContain('substitutions');
    await expect(containerB.services.matches.getMatchById(pilotIds.match)).resolves.toMatchObject({
      status: 'completed',
    });
    await expect(containerB.objectStores.photos.readObject?.('restart/photo.jpg')).resolves.toEqual(
      Buffer.from('photo-bytes'),
    );

    // A third construction supplies the pilot/demo fallback again. Persisted terminal state wins,
    // which is the container-level equivalent of a non-destructive repeat initialization.
    const containerAfterRepeatInitialization = createApplicationContainer(options);
    await expect(
      containerAfterRepeatInitialization.services.matches.getMatchById(pilotIds.match),
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(
      containerAfterRepeatInitialization.services.matchReports.getMatchReportById(pilotIds.report),
    ).resolves.toMatchObject({ status: 'submitted' });
    await expect(
      containerAfterRepeatInitialization.repositories.matchSheets.findById(pilotIds.homeSheet),
    ).resolves.toMatchObject({ status: 'locked' });
    await expect(
      containerAfterRepeatInitialization.services.recognitions.startRecognition(pilotIds.match),
    ).resolves.toMatchObject({ status: 'locked' });
  });
});

function entity<T extends object>(
  id: UUID,
  fields: T,
): T & { id: UUID; createdAt: string; updatedAt: string; deletedAt: null } {
  return { id, ...fields, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
}
function player(firstName: string, lastName: string) {
  return {
    federationId: pilotIds.federation,
    firstName,
    lastName,
    birthDate: '2000-01-01',
    birthPlace: null,
    fiscalCode: null,
    status: 'active' as const,
  };
}
function registration(playerId: UUID, clubId: UUID, registrationNumber: string) {
  return {
    playerId,
    clubId,
    season: '2026',
    registrationNumber,
    status: 'active' as const,
    registeredAt: timestamp,
  };
}
function staff(firstName: string, lastName: string) {
  return {
    federationId: pilotIds.federation,
    firstName,
    lastName,
    birthDate: null,
    fiscalCode: null,
    status: 'active' as const,
  };
}
function staffRegistration(staffMemberId: UUID, clubId: UUID, registrationNumber: string) {
  return {
    staffMemberId,
    clubId,
    season: '2026',
    role: 'coach',
    registrationNumber,
    status: 'active' as const,
  };
}
