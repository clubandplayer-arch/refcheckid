import { Organizations, PlatformError, text, optional, timestamp } from './organizations.js';
import { stableId } from './store.js';
import type {
  PersonRecord,
  SquadMember,
  Competition,
  Team,
  Official,
  Entry,
  Fixture,
  Delegation,
  Organization,
  Entity,
} from './types.js';
export interface ClubRecord extends Entity {
  organizationId: string;
  unitId: string;
  externalCode: string;
  clubId: string;
  name: string;
}
export class Catalog extends Organizations {
  async listCompetitions(organizationId: string, unitId: string) {
    await this.scope(organizationId, unitId, 'read');
    const result: Competition[] = [];
    result.push(...(await this.db.find<Competition>('competitions', { organizationId, unitId })));
    for (const grant of await this.db.find<Delegation>('delegations', {
      recipientOrganizationId: organizationId,
      recipientUnitId: unitId,
      active: true,
    })) {
      try {
        const row = await this.competition(grant.competitionId, 'read');
        if (!result.some((c) => c.id === row.id)) result.push(row);
      } catch (error) {
        if (!(error instanceof PlatformError && error.status === 403)) throw error;
      }
    }
    return result;
  }
  async createCompetition(body: Record<string, unknown>) {
    const organizationId = text(body, 'organizationId'),
      unitId = text(body, 'unitId');
    const org = await this.scope(organizationId, unitId, 'competitions');
    if (org.kind !== 'sports')
      throw new PlatformError(400, 'Le competizioni appartengono a un ente sportivo.');
    const sport = text(body, 'sport');
    if (!['football', 'basketball', 'volleyball'].includes(sport))
      throw new PlatformError(400, 'Disciplina non supportata.');
    const rules =
      sport === 'football'
        ? { periods: 2, minutesPerPeriod: 45, starters: 11, scoring: 'goals' as const, version: 1 }
        : sport === 'basketball'
          ? {
              periods: 4,
              minutesPerPeriod: 10,
              starters: 5,
              scoring: 'points' as const,
              version: 1,
            }
          : { periods: 5, minutesPerPeriod: 0, starters: 6, scoring: 'sets' as const, version: 1 };
    const periods = Number(
        body.periods === '' || body.periods === undefined ? rules.periods : body.periods,
      ),
      minutesPerPeriod = Number(
        body.minutesPerPeriod === '' || body.minutesPerPeriod === undefined
          ? rules.minutesPerPeriod
          : body.minutesPerPeriod,
      ),
      starters = Number(
        body.starters === '' || body.starters === undefined ? rules.starters : body.starters,
      );
    if (
      (sport === 'volleyball' && ![3, 5].includes(periods)) ||
      (sport !== 'volleyball' && minutesPerPeriod < 1)
    )
      throw new PlatformError(
        400,
        'Pallavolo: 3 o 5 set. Negli sport a tempo specifica i minuti del periodo.',
      );
    if (
      !Number.isInteger(periods) ||
      periods < 1 ||
      periods > 10 ||
      !Number.isInteger(minutesPerPeriod) ||
      minutesPerPeriod < 0 ||
      minutesPerPeriod > 120 ||
      !Number.isInteger(starters) ||
      starters < 1 ||
      starters > 20
    )
      throw new PlatformError(400, 'Regole dei periodi o della formazione non valide.');
    const id = stableId(
      'competition',
      organizationId,
      unitId,
      sport,
      text(body, 'name'),
      text(body, 'season'),
      text(body, 'category'),
      optional(body, 'group'),
    );
    const existing = await this.db.get<Competition>('competitions', id);
    if (existing)
      throw new PlatformError(409, 'Campionato e girone già presenti per questa stagione.');
    return this.db.put<Competition>('competitions', {
      id,
      organizationId,
      unitId,
      name: text(body, 'name'),
      sport: sport as Competition['sport'],
      season: text(body, 'season'),
      category: text(body, 'category'),
      group: optional(body, 'group'),
      rules: {
        ...rules,
        periods,
        minutesPerPeriod,
        starters,
        goalkeeperRequired: sport === 'football',
        benchLimit: sport === 'football' ? 20 : 14,
        staffLimit: 5,
        minShirtNumber: sport === 'basketball' ? 0 : 1,
      },
    });
  }
  async createClub(body: Record<string, unknown>) {
    const organizationId = text(body, 'organizationId'),
      unitId = text(body, 'unitId');
    const org = await this.scope(organizationId, unitId, 'people');
    if (!org.federationId)
      throw new PlatformError(400, 'Anagrafica società riservata agli enti sportivi.');
    const code = text(body, 'code');
    const key = stableId('club-code', organizationId, code);
    const mapped = await this.db.get<ClubRecord>('clubs', key);
    if (mapped) await this.scope(organizationId, mapped.unitId, 'people');
    const legacyId = optional(body, 'existingClubId');
    if (legacyId) await this.scope(organizationId, org.rootUnitId, 'people');
    const existing = legacyId ? await this.app.repositories.clubs.findById(legacyId) : null;
    if (legacyId && (!existing || existing.federationId !== org.federationId))
      throw new PlatformError(400, 'Società esistente fuori competenza.');
    const clubId = mapped?.clubId || legacyId || stableId('club', organizationId, code);
    const club = await this.app.repositories.clubs.findById(clubId);
    const name = text(body, 'name');
    if (club) await this.app.repositories.clubs.update(clubId, { name });
    else
      await this.app.repositories.clubs.create({
        id: clubId,
        federationId: org.federationId,
        name,
        fiscalCode: optional(body, 'fiscalCode') || null,
        status: 'active',
      });
    return this.db.put<ClubRecord>('clubs', {
      ...(mapped ?? {}),
      id: key,
      organizationId,
      unitId,
      externalCode: code,
      clubId,
      name,
    });
  }
  async createTeam(body: Record<string, unknown>) {
    const organizationId = text(body, 'organizationId'),
      unitId = text(body, 'unitId');
    const org = await this.scope(organizationId, unitId, 'people');
    const clubId = text(body, 'clubId');
    const club = await this.app.repositories.clubs.findById(clubId);
    if (!club || club.federationId !== org.federationId)
      throw new PlatformError(400, 'Società fuori competenza.');
    const code = text(body, 'code'),
      sport = text(body, 'sport'),
      season = text(body, 'season');
    if (!['football', 'basketball', 'volleyball'].includes(sport))
      throw new PlatformError(400, 'Disciplina non supportata.');
    const id = stableId('team', organizationId, code, season);
    const existing = await this.db.get<Team>('teams', id);
    if (existing) await this.scope(organizationId, existing.unitId, 'people');
    return this.db.put<Team>('teams', {
      ...(existing ?? {}),
      id,
      organizationId,
      unitId,
      code,
      clubId,
      name: text(body, 'name'),
      sport,
      season,
      category: text(body, 'category'),
    });
  }
  async createEntry(body: Record<string, unknown>) {
    const competition = await this.competition(text(body, 'competitionId'), 'competitions');
    const team = await this.db.get<Team>('teams', text(body, 'teamId'));
    if (
      !team ||
      team.organizationId !== competition.organizationId ||
      team.sport !== competition.sport ||
      team.season !== competition.season
    )
      throw new PlatformError(
        400,
        'Squadra, stagione e disciplina non compatibili con il campionato.',
      );
    return this.db.put<Entry>('entries', {
      id: stableId('entry', competition.id, team.id),
      organizationId: competition.organizationId,
      competitionId: competition.id,
      teamId: team.id,
      name: team.name,
      code: team.code,
      season: team.season,
    });
  }
  async createOfficial(body: Record<string, unknown>) {
    const organizationId = text(body, 'organizationId'),
      unitId = text(body, 'unitId');
    const org = await this.scope(organizationId, unitId, 'people');
    const code = text(body, 'code');
    const id = stableId('official', organizationId, code);
    const existing = await this.db.get<Official>('officials', id);
    if (existing) await this.scope(organizationId, existing.unitId, 'people');
    const sports = text(body, 'sports')
      .split(',')
      .map((s) => s.trim());
    if (sports.some((s) => !['football', 'basketball', 'volleyball'].includes(s)))
      throw new PlatformError(400, 'Disciplina arbitro non valida.');
    const firstName = text(body, 'firstName'),
      lastName = text(body, 'lastName');
    const refereeId = existing?.refereeId ?? stableId('referee', organizationId, code);
    const referee = await this.app.repositories.referees.findById(refereeId);
    if (referee) await this.app.repositories.referees.update(refereeId, { firstName, lastName });
    else
      await this.app.repositories.referees.create({
        id: refereeId,
        federationId: org.federationId ?? org.id,
        firstName,
        lastName,
        fiscalCode: null,
        status: 'active',
      });
    return this.db.put<Official>('officials', {
      ...(existing ?? {}),
      id,
      organizationId,
      unitId,
      code,
      firstName,
      lastName,
      sports,
      active: existing?.active ?? true,
      actorId: existing?.actorId ?? null,
      refereeId,
    });
  }
  async assignSquad(body: Record<string, unknown>) {
    const person = await this.db.get<PersonRecord>('people', text(body, 'personRecordId')),
      team = await this.db.get<Team>('teams', text(body, 'teamId'));
    if (
      !person ||
      !team ||
      person.organizationId !== team.organizationId ||
      person.clubId !== team.clubId ||
      person.season !== team.season
    )
      throw new PlatformError(
        400,
        'Tesseramento e squadra devono appartenere alla stessa società e stagione.',
      );
    await this.scope(person.organizationId, person.unitId, 'people');
    await this.scope(team.organizationId, team.unitId, 'people');
    return this.db.put<SquadMember>('squad_members', {
      id: stableId('squad-member', team.id, person.registrationId),
      organizationId: team.organizationId,
      unitId: team.unitId,
      teamId: team.id,
      registrationId: person.registrationId,
      kind: person.kind,
      active: true,
    });
  }
  async squadRoster(teamId: string, cursor?: string) {
    const team = await this.db.get<Team>('teams', teamId);
    if (!team) throw new PlatformError(404, 'Squadra non trovata.');
    await this.scope(team.organizationId, team.unitId, 'people');
    const page = await this.db.page<SquadMember>('squad_members', { teamId, active: true }, cursor);
    const items = [];
    for (const member of page.items) {
      const person = await this.db.get<PersonRecord>(
        'people',
        stableId('person-record', member.registrationId),
      );
      if (person)
        items.push({
          ...member,
          name: `${person.lastName} ${person.firstName}`,
          code: person.code,
          status: person.status,
        });
    }
    return { ...page, items };
  }
  async removeSquadMember(id: string) {
    const member = await this.db.get<SquadMember>('squad_members', id);
    if (!member) throw new PlatformError(404, 'Assegnazione non trovata.');
    await this.scope(member.organizationId, member.unitId, 'people');
    return this.db.update<SquadMember>('squad_members', id, { active: false });
  }
  async changePersonStatus(id: string, status: string) {
    const person = await this.db.get<PersonRecord>('people', id);
    if (!person) throw new PlatformError(404, 'Tesserato non trovato.');
    await this.scope(person.organizationId, person.unitId, 'people');
    if (!['active', 'suspended', 'ended'].includes(status))
      throw new PlatformError(400, 'Stato non valido.');
    if (person.kind === 'player')
      await this.app.repositories.registrations.update(person.registrationId, {
        status: status as PersonRecord['status'],
      });
    else {
      const registration = await this.app.repositories.registrations.findStaffRegistrationById(
        person.registrationId,
      );
      if (!registration) throw new PlatformError(404, 'Tesseramento non trovato.');
      await this.app.repositories.registrations.syncStaffRegistration({
        ...registration,
        status: status as PersonRecord['status'],
      });
    }
    return this.db.update<PersonRecord>('people', id, { status: status as PersonRecord['status'] });
  }
  async matchRoster(matchId: string, clubId: string) {
    const fixture = (await this.db.find<Fixture>('fixtures', { matchId }))[0];
    if (!fixture) return null;
    const match = await this.app.repositories.matches.findById(matchId);
    if (!match || ![match.homeClubId, match.awayClubId].includes(clubId))
      throw new PlatformError(403, 'Società fuori dalla gara.');
    if (!this.auth.roles.includes('manager') || !this.auth.clubIds?.includes(clubId))
      await this.competition(fixture.competitionId, 'read');
    const teamId = clubId === match.homeClubId ? fixture.homeTeamId : fixture.awayTeamId;
    const members = await this.db.find<SquadMember>('squad_members', { teamId, active: true });
    const players = [],
      registrations = [],
      staff = [],
      staffRegistrations = [];
    for (const member of members) {
      if (member.kind === 'player') {
        const registration = await this.app.repositories.registrations.findById(
          member.registrationId,
        );
        const player = registration
          ? await this.app.repositories.players.findById(registration.playerId)
          : null;
        if (registration && player) {
          players.push(player);
          registrations.push(registration);
        }
      } else {
        const registration = await this.app.repositories.registrations.findStaffRegistrationById(
          member.registrationId,
        );
        const person = registration
          ? await this.app.repositories.registrations.findStaffMemberById(
              registration.staffMemberId,
            )
          : null;
        if (registration && person) {
          staff.push(person);
          staffRegistrations.push(registration);
        }
      }
    }
    return { teamId, players, registrations, staff, staffRegistrations };
  }
  async createFixture(body: Record<string, unknown>) {
    const competition = await this.competition(text(body, 'competitionId'), 'competitions');
    const home = await this.db.get<Team>('teams', text(body, 'homeTeamId')),
      away = await this.db.get<Team>('teams', text(body, 'awayTeamId'));
    if (!home || !away || home.id === away.id || home.clubId === away.clubId)
      throw new PlatformError(400, 'Seleziona due squadre distinte di società diverse.');
    for (const team of [home, away])
      if (!(await this.db.get('entries', stableId('entry', competition.id, team.id))))
        throw new PlatformError(400, 'Entrambe le squadre devono essere iscritte al campionato.');
    const externalCode = text(body, 'code');
    const id = stableId('fixture', competition.id, externalCode);
    const existing = await this.db.get<Fixture>('fixtures', id);
    const scheduledAt = timestamp(text(body, 'scheduledAt'));
    const venue = text(body, 'venue');
    const durationMinutes = Number(body.durationMinutes ?? 120);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > 480)
      throw new PlatformError(400, 'Durata gara non valida.');
    if (existing) {
      if (
        existing.scheduledAt === scheduledAt &&
        existing.venue === venue &&
        existing.homeTeamId === home.id &&
        existing.awayTeamId === away.id
      )
        return existing;
      throw new PlatformError(
        409,
        'Gara già presente con dati diversi: usa la variazione calendario per avvisare gli arbitri.',
      );
    }
    const org = (await this.db.get<Organization>('organizations', competition.organizationId))!;
    const matchId = stableId('match', competition.id, externalCode);
    await this.app.repositories.matches.create({
      id: matchId,
      federationId: org.federationId!,
      homeClubId: home.clubId,
      awayClubId: away.clubId,
      refereeId: null,
      season: competition.season,
      scheduledAt,
      venue,
      status: 'scheduled',
    });
    for (const team of [home, away])
      await this.app.repositories.matchSheets.create({
        id: stableId('sheet', matchId, team.clubId),
        matchId,
        clubId: team.clubId,
        status: 'draft',
        submittedAt: null,
      });
    return this.db.put<Fixture>('fixtures', {
      id,
      organizationId: competition.organizationId,
      unitId: competition.unitId,
      competitionId: competition.id,
      externalCode,
      homeTeamId: home.id,
      awayTeamId: away.id,
      matchId,
      round: text(body, 'round'),
      scheduledAt,
      venue,
      durationMinutes,
      cancelled: false,
      revision: 1,
    });
  }
}
