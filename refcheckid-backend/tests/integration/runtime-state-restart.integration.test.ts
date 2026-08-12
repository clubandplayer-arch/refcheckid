import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { pilotIds } from '../../src/config/pilot-data.js';

describe('runtime state restart persistence', () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('restores master data, lineup, recognition, report, match state, and photo objects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'refcheckid-restart-'));
    temporaryRoots.push(root);
    const options = {
      runtimeStateRoot: join(root, 'runtime'),
      photoMetadataRoot: join(root, 'photo-metadata'),
      photoStorageRoot: join(root, 'photo-objects'),
    };
    const timestamp = '2026-08-12T12:00:00.000Z';
    const playerId = '81000000-0000-4000-8000-000000000001';
    const registrationId = '82000000-0000-4000-8000-000000000001';

    const containerA = createApplicationContainer(options);
    await containerA.repositories.federations.upsert({
      id: pilotIds.federation,
      name: 'Federazione restart',
      fiscalCode: null,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
    await containerA.repositories.clubs.upsert({
      id: pilotIds.homeClub,
      federationId: pilotIds.federation,
      name: 'Restart club',
      fiscalCode: null,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
    await containerA.repositories.players.upsert({
      id: playerId,
      federationId: pilotIds.federation,
      firstName: 'Ada',
      lastName: 'Restart',
      birthDate: '2000-01-01',
      birthPlace: null,
      fiscalCode: null,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
    await containerA.repositories.registrations.upsert({
      id: registrationId,
      playerId,
      clubId: pilotIds.homeClub,
      season: '2026',
      registrationNumber: 'RESTART-1',
      status: 'active',
      registeredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
    const [lineupEntry] = await containerA.repositories.matchSheetPlayers.replaceByMatchSheet(
      pilotIds.homeSheet,
      [
        {
          matchSheetId: pilotIds.homeSheet,
          playerRegistrationId: registrationId,
          shirtNumber: 1,
          role: 'starter',
          lineupOrder: 0,
          isGoalkeeper: true,
          isCaptain: true,
          isViceCaptain: false,
          status: 'listed',
        },
      ],
    );
    await containerA.repositories.matchSheets.updateStatus(pilotIds.homeSheet, 'locked');
    await containerA.repositories.matches.updateStatus(pilotIds.match, 'completed');
    await containerA.repositories.recognitions.updateWorkflowStatus(pilotIds.match, 'locked');
    await containerA.repositories.recognitions.create({
      matchId: pilotIds.match,
      refereeId: pilotIds.referee,
      matchSheetPlayerId: lineupEntry.id,
      matchSheetStaffId: null,
      recognizedAt: timestamp,
      status: 'recognized',
      notes: null,
    });
    await containerA.repositories.matchReports.updateContent(pilotIds.report, { summary: '2-1' });
    await containerA.repositories.matchReports.updateStatus(pilotIds.report, 'submitted');
    await containerA.objectStores.photos.putObject?.(
      'restart/photo.jpg',
      Buffer.from('photo-bytes'),
    );

    const containerB = createApplicationContainer(options);

    await expect(
      containerB.repositories.federations.findById(pilotIds.federation),
    ).resolves.toMatchObject({ name: 'Federazione restart' });
    await expect(containerB.repositories.clubs.findById(pilotIds.homeClub)).resolves.toMatchObject({
      name: 'Restart club',
    });
    await expect(containerB.repositories.players.findById(playerId)).resolves.toMatchObject({
      firstName: 'Ada',
    });
    await expect(
      containerB.repositories.registrations.findById(registrationId),
    ).resolves.toMatchObject({ registrationNumber: 'RESTART-1' });
    await expect(
      containerB.repositories.matchSheetPlayers.listByMatchSheet(pilotIds.homeSheet),
    ).resolves.toMatchObject([{ lineupOrder: 0, isGoalkeeper: true, isCaptain: true }]);
    await expect(
      containerB.repositories.matchSheets.findById(pilotIds.homeSheet),
    ).resolves.toMatchObject({ status: 'locked' });
    await expect(containerB.repositories.matches.findById(pilotIds.match)).resolves.toMatchObject({
      status: 'completed',
    });
    await expect(
      containerB.repositories.recognitions.getWorkflowByMatch(pilotIds.match),
    ).resolves.toEqual({ matchId: pilotIds.match, status: 'locked' });
    await expect(
      containerB.repositories.recognitions.listByMatch(pilotIds.match),
    ).resolves.toHaveLength(1);
    await expect(
      containerB.repositories.matchReports.findById(pilotIds.report),
    ).resolves.toMatchObject({ status: 'submitted', summary: '2-1' });
    await expect(containerB.objectStores.photos.readObject?.('restart/photo.jpg')).resolves.toEqual(
      Buffer.from('photo-bytes'),
    );
  });
});
