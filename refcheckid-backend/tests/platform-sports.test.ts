import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { preparedApp, dataset } from './runtime-fixtures.js';
import { Imports } from '../src/platform/imports.js';
import type { AuthContext } from '../src/api/http.js';
import type { GameEvent, Membership, PersonRecord } from '../src/platform/types.js';
import type { SubmitMatchSheetPlayerInput } from '../src/services/match-sheet-service.js';

it.each(['basketball', 'volleyball'] as const)(
  'runs %s through sport-specific lineups, recognition, periods, final report and homologation',
  async (sport) => {
    const app = await preparedApp();
    const rootAuth: AuthContext = {
        actorId: randomUUID(),
        roles: ['federation'],
        federationIds: [dataset.federationSyncPayload.federations[0].id],
      },
      root = new Imports(app, rootAuth);
    try {
      const org = await root.create({
          name: `Sport ${sport}`,
          kind: 'sports',
          federationId: rootAuth.federationIds![0],
        }),
        scope = { organizationId: org.id, unitId: org.rootUnitId };
      const competition = await root.createCompetition({
        ...scope,
        name: `Campionato ${sport}`,
        sport,
        season: '2026/2027',
        category: 'Open',
        ...(sport === 'volleyball' ? { periods: 3 } : {}),
      });
      expect(competition.rules.starters).toBe(sport === 'basketball' ? 5 : 6);
      expect(competition.rules.goalkeeperRequired).toBe(false);
      const clubs = [],
        teams = [];
      for (const code of ['HOME', 'AWAY']) {
        const club = await root.createClub({ ...scope, code, name: `${sport} ${code}` });
        clubs.push(club);
        const team = await root.createTeam({
          ...scope,
          code,
          name: club.name,
          clubId: club.clubId,
          sport,
          season: competition.season,
          category: competition.category,
        });
        teams.push(team);
        await root.createEntry({ competitionId: competition.id, teamId: team.id });
      }
      const fixture = await root.createFixture({
        competitionId: competition.id,
        code: 'SPORT-GAME',
        homeTeamId: teams[0].id,
        awayTeamId: teams[1].id,
        scheduledAt: '2026-12-10T12:00:00+01:00',
        venue: 'Sport test',
        round: '1',
      });
      const official = await root.createOfficial({
          ...scope,
          code: 'SPORT-REF',
          firstName: 'Sport',
          lastName: 'Referee',
          sports: sport,
        }),
        actorId = randomUUID();
      await root.db.update('officials', official.id, { ...official, actorId });
      await root.db.put<Membership>('memberships', {
        ...scope,
        actorId,
        refereeId: official.refereeId,
        role: 'referee',
        active: true,
        descendants: false,
      });
      const referee = new Imports(app, {
        actorId,
        roles: ['referee'],
        refereeIds: [official.refereeId],
      });
      const appointment = await root.createAppointment({
        fixtureId: fixture.id,
        officialId: official.id,
        role: 'principal',
        send: true,
      });
      await referee.changeAppointment(appointment.id, { action: 'accept' });
      const registrationIds: string[] = [];
      let scorer = '';
      for (const [side, club] of clubs.entries()) {
        const players: SubmitMatchSheetPlayerInput[] = [];
        for (let n = 0; n < competition.rules.starters; n++) {
          const person = await app.repositories.players.create({
            federationId: org.federationId!,
            firstName: `Player ${n}`,
            lastName: `Side ${side}`,
            birthDate: '2005-01-01',
            birthPlace: null,
            fiscalCode: null,
            status: 'active',
          });
          const registration = await app.repositories.registrations.create({
            playerId: person.id,
            clubId: club.clubId,
            season: competition.season,
            registrationNumber: `${side}-${n}`,
            status: 'active',
            registeredAt: new Date().toISOString(),
          });
          registrationIds.push(registration.id);
          if (side === 0 && n === 0) scorer = registration.id;
          const record = await root.db.put<PersonRecord>('people', {
            ...scope,
            kind: 'player',
            code: registration.registrationNumber,
            firstName: person.firstName,
            lastName: person.lastName,
            birthDate: person.birthDate,
            clubId: club.clubId,
            season: competition.season,
            personId: person.id,
            registrationId: registration.id,
            status: 'active',
          });
          await root.assignSquad({ personRecordId: record.id, teamId: teams[side].id });
          players.push({
            playerRegistrationId: registration.id,
            shirtNumber: sport === 'basketball' ? n : n + 1,
            role: 'starter',
            isCaptain: n === 0,
            isGoalkeeper: false,
            isViceCaptain: false,
          });
        }
        const now = new Date().toISOString(),
          staff = await app.repositories.registrations.syncStaffMember({
            id: randomUUID(),
            federationId: org.federationId!,
            firstName: 'Coach',
            lastName: String(side),
            birthDate: null,
            fiscalCode: null,
            status: 'active',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
        const staffRegistration = await app.repositories.registrations.syncStaffRegistration({
          id: randomUUID(),
          staffMemberId: staff.id,
          clubId: club.clubId,
          season: competition.season,
          role: 'Allenatore',
          registrationNumber: `COACH-${side}`,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        registrationIds.push(staffRegistration.id);
        const record = await root.db.put<PersonRecord>('people', {
          ...scope,
          kind: 'staff',
          code: staffRegistration.registrationNumber,
          firstName: staff.firstName,
          lastName: staff.lastName,
          birthDate: null,
          clubId: club.clubId,
          season: competition.season,
          personId: staff.id,
          registrationId: staffRegistration.id,
          status: 'active',
        });
        await root.assignSquad({ personRecordId: record.id, teamId: teams[side].id });
        const sheet = (await app.repositories.matchSheets.listByMatch(fixture.matchId)).find(
          (row) => row.clubId === club.clubId,
        )!;
        await expect(
          app.services.matchSheets.submitMatchSheet(sheet.id, {
            players: players.slice(1),
            staff: [{ staffRegistrationId: staffRegistration.id, role: 'Allenatore' }],
          }),
        ).rejects.toThrow('titolari');
        await app.services.matchSheets.submitMatchSheet(sheet.id, {
          players,
          staff: [{ staffRegistrationId: staffRegistration.id, role: 'Allenatore' }],
        });
        await app.services.matchSheets.lockMatchSheet(sheet.id);
      }
      await app.services.recognitions.startRecognition(fixture.matchId);
      for (const registrationId of registrationIds)
        await app.services.recognitions.recordDecision(
          fixture.matchId,
          registrationId,
          'recognized',
          'Synthetic missing-photo fixture: manual identity confirmation',
          actorId,
        );
      await app.services.recognitions.completeRecognition(fixture.matchId);
      const events: GameEvent[] = [];
      let score = 0,
        revision = 0;
      const lastPeriod = sport === 'basketball' ? 4 : 2;
      for (let period = 1; period <= lastPeriod; period++) {
        if (period <= 2) {
          const points = sport === 'basketball' ? period + 1 : 1;
          score += points;
          events.push({
            id: randomUUID(),
            period,
            type: sport === 'basketball' ? 'points' : 'set',
            clubId: clubs[0].clubId,
            registrationId: sport === 'basketball' ? scorer : null,
            incomingRegistrationId: null,
            minute: sport === 'basketball' ? period : 0,
            stoppage: 0,
            points,
          });
        }
        const summary = await referee.submitPeriod(fixture.id, {
          operationId: randomUUID(),
          revision,
          period,
          homeScore: score,
          awayScore: 0,
          events,
          state: period === lastPeriod ? 'final_confirmed' : 'period_confirmed',
        });
        expect(summary?.homeScore).toBe(score);
        revision++;
      }
      await referee.submitGameReport(fixture.id, { notes: `Final ${sport} report` });
      const final = await root.homologate(fixture.id);
      expect(final.homologatedAt).toBeTruthy();
      expect(final.homeScore).toBe(sport === 'basketball' ? 5 : 2);
      expect((await app.repositories.matches.findById(fixture.matchId))?.status).toBe('completed');
    } finally {
      await app.store.close();
    }
  },
);
