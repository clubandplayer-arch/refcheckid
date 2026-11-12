import { createHash } from 'node:crypto';
import { Results } from './results.js';
import { Organizations,PlatformError, text } from './organizations.js';
import { stableId } from './store.js';
import type { Entity, Competition, Fixture, GameSummary, PeriodUpdate, Team } from './types.js';
export interface PublicationPolicy extends Entity {
  competitionId: string;
  sport: string;
  season: string;
  name: string;
  organizationId: string;
  unitId: string;
  consent: boolean;
  consentEvents: boolean;
  consentNames: boolean;
  mode: 'private' | 'public';
  includeLive: boolean;
  includeEvents: boolean;
  includeNames: boolean;
  revision: number;
  changedBy: string;
}
export interface MatchProgress extends Entity {
  fixtureId: string;
  phase: 'live' | 'interval' | 'finished' | 'suspended';
  period: number;
  seconds: number;
  runningSince: string | null;
  revision: number;
}
export class Publication extends Results {
  async owningCompetition(id: string, action: 'structure' | 'reports') {
    const competition = await this.db.get<Competition>('competitions', id);
    if (!competition) throw new PlatformError(404, 'Campionato non trovato.');
    const checker=new Organizations(this.app,{...this.auth,roles:this.auth.roles.filter(role=>role!=='admin')});
    const org = await checker.scope(competition.organizationId, competition.unitId, action);
    if (org.kind !== 'sports')
      throw new PlatformError(403, 'Competenza dell’ente sportivo richiesta.');
    return competition;
  }
  private admin() {
    if (!this.auth.roles.includes('admin'))
      throw new PlatformError(
        403,
        'La distribuzione dei dati è riservata all’amministrazione della piattaforma.',
      );
  }
  async publicationPolicy(id: string) {
    if (!this.auth.roles.includes('admin')) await this.owningCompetition(id, 'structure');
    else if (!(await this.db.get('competitions', id)))
      throw new PlatformError(404, 'Campionato non trovato.');
    return (
      (await this.db.get<PublicationPolicy>('publication', id)) ?? {
        id,
        competitionId: id,
        consent: false,
        consentEvents: false,
        consentNames: false,
        mode: 'private',
        includeLive: false,
        includeEvents: false,
        includeNames: false,
        revision: 0,
      }
    );
  }
  async setPublication(id: string, body: Record<string, unknown>, owner = false) {
    const previous = await this.publicationPolicy(id);
    if (Number(body.revision) !== previous.revision)
      throw new PlatformError(409, 'Impostazioni modificate: ricarica.');
    const competition = owner
      ? await this.owningCompetition(id, 'structure')
      : (this.admin(), (await this.db.get<Competition>('competitions', id))!);
    const values = { ...previous };
    if (owner) {
      for (const key of ['consent', 'consentEvents', 'consentNames'] as const) {
        if (typeof body[key] !== 'boolean') throw new PlatformError(400, 'Consensi non validi.');
        values[key] = body[key];
      }
      if (!values.consent) {
        values.mode = 'private';
        values.includeLive = false;
      }
      if (!values.consentEvents) values.includeEvents = false;
      if (!values.consentNames) values.includeNames = false;
    } else {
      if (!['private', 'public'].includes(String(body.mode)))
        throw new PlatformError(400, 'Canale non valido.');
      if (
        ['includeLive', 'includeEvents', 'includeNames'].some(
          (key) => typeof body[key] !== 'boolean',
        )
      )
        throw new PlatformError(400, 'Selezioni non valide.');
      values.mode = body.mode as 'private' | 'public';
      values.includeLive = body.includeLive as boolean;
      values.includeEvents = body.includeEvents as boolean;
      values.includeNames = body.includeNames as boolean;
      if (
        values.mode === 'public' &&
        (!values.consent ||
          (values.includeEvents && !values.consentEvents) ||
          (values.includeNames && !values.consentNames))
      )
        throw new PlatformError(409, 'Manca l’autorizzazione dell’ente per i dati selezionati.');
    }
    const row = await this.db.put<PublicationPolicy>('publication', {
      ...values,
      id,
      competitionId: id,
      sport: competition.sport,
      season: competition.season,
      name: competition.name,
      organizationId: competition.organizationId,
      unitId: competition.unitId,
      revision: previous.revision + 1,
      changedBy: this.auth.actorId,
    });
    await this.db.put('publication_history', {
      ...row,
      id: stableId('publication-change', id, String(row.revision)),
    });
    return row;
  }
  async publicationCatalog(cursor?: string) {
    this.admin();
    return this.db.page<Competition>('competitions', {}, cursor);
  }
  private async publishedCompetition(id: string) {
    const policy = await this.db.get<PublicationPolicy>('publication', id),
      competition = await this.db.get<Competition>('competitions', id);
    if (!policy?.consent || policy.mode !== 'public' || !competition)
      throw new PlatformError(404, 'Campionato non pubblicato.');
    return { policy, competition };
  }
  async publicCompetitions(cursor?: string, sport?: string) {
    const page = await this.db.page<PublicationPolicy>(
      'publication',
      { mode: 'public', consent: true, ...(sport ? { sport } : {}) },
      cursor,
    );
    await this.app.store.prefetch?.(
      page.items.map((row) => ({ repository: 'platform_competitions', id: row.competitionId })),
    );
    const items = [];
    for (const policy of page.items) {
      const row = await this.db.get<Competition>('competitions', policy.competitionId);
      if (row)
        items.push({
          id: row.id,
          name: row.name,
          sport: row.sport,
          season: row.season,
          category: row.category,
          group: row.group,
        });
    }
    return { ...page, items };
  }
  private async prefetchPublic(rows: readonly Fixture[], policy: PublicationPolicy) {
    const runtime = this.app.store;
    if (!runtime.prefetch) return;
    await runtime.prefetch(
      rows.flatMap((row) => [
        { repository: 'platform_fixtures', id: row.id },
        { repository: 'platform_teams', id: row.homeTeamId },
        { repository: 'platform_teams', id: row.awayTeamId },
        { repository: 'platform_summaries', id: row.id },
        { repository: 'platform_progress', id: row.id },
        { repository: 'matches', id: row.matchId },
      ]),
    );
    const updates: string[] = [];
    for (const row of rows) {
      const summary = await this.db.get<GameSummary>('summaries', row.id);
      const op = policy.includeLive
        ? summary?.operationId
        : summary?.lastConfirmedOperationId ||
          (summary?.state !== 'provisional' ? summary?.operationId : undefined);
      if (op) updates.push(stableId('update', row.id, op));
    }
    await runtime.prefetch(updates.map((id) => ({ repository: 'platform_updates', id })));
    if (
      policy.includeNames &&
      policy.consentNames &&
      policy.includeEvents &&
      policy.consentEvents
    ) {
      const ids = new Set<string>();
      for (const id of updates) {
        const update = await this.db.get<PeriodUpdate>('updates', id);
        for (const event of update?.events ?? []) {
          if (event.registrationId) ids.add(event.registrationId);
          if (event.incomingRegistrationId) ids.add(event.incomingRegistrationId);
        }
      }
      await runtime.prefetch([...ids].map((id) => ({ repository: 'player_registrations', id })));
      const people = [];
      for (const id of ids) {
        const registration = await this.app.repositories.registrations.findById(id);
        if (registration) people.push({ repository: 'players', id: registration.playerId });
      }
      await runtime.prefetch(people);
    }
  }
  async publicFixtures(competitionId: string, cursor?: string) {
    const { policy } = await this.publishedCompetition(competitionId);
    const page = await this.db.page<Fixture>('fixtures', { competitionId }, cursor);
    await this.prefetchPublic(page.items, policy);
    const items = [];
    for (const row of page.items) items.push(await this.publicFixture(row.id));
    return { ...page, items, serverTime: new Date().toISOString() };
  }
  async publicFixture(id: string) {
    const fixture = await this.db.get<Fixture>('fixtures', id);
    if (!fixture) throw new PlatformError(404, 'Gara non pubblicata.');
    const { policy, competition } = await this.publishedCompetition(fixture.competitionId);
    await this.prefetchPublic([fixture], policy);
    const summary = await this.db.get<GameSummary>('summaries', id);
    let selected: PeriodUpdate | null = null;
    const operation = policy.includeLive
      ? summary?.operationId
      : summary?.lastConfirmedOperationId ||
        (summary?.state !== 'provisional' ? summary?.operationId : undefined);
    if (operation)
      selected = await this.db.get<PeriodUpdate>('updates', stableId('update', id, operation));
    const home = await this.db.get<Team>('teams', fixture.homeTeamId),
      away = await this.db.get<Team>('teams', fixture.awayTeamId),
      progress = await this.db.get<MatchProgress>('progress', id);
    const events = [];
    if (policy.includeEvents && policy.consentEvents && selected)
      for (const event of selected.events) {
        const person = async (registrationId: string | null) => {
          if (!policy.includeNames || !policy.consentNames || !registrationId) return {};
          const registration = await this.app.repositories.registrations.findById(registrationId);
          const player = registration
            ? await this.app.repositories.players.findById(registration.playerId)
            : null;
          return player
            ? {
                name: `${player.firstName} ${player.lastName}`,
                id: stableId('public-person', fixture.organizationId, player.id),
              }
            : {};
        };
        const match = await this.app.repositories.matches.findById(fixture.matchId);
        events.push({
          id: stableId('public-event', id, event.id),
          type: event.type,
          period: event.period,
          minute: event.minute,
          stoppage: event.stoppage,
          points: event.points,
          team: event.clubId === match?.homeClubId ? 'home' : 'away',
          participant: await person(event.registrationId),
          incoming: await person(event.incomingRegistrationId),
        });
      }
    return {
      id: fixture.id,
      competition: {
        id: competition.id,
        name: competition.name,
        sport: competition.sport,
        season: competition.season,
        category: competition.category,
        group: competition.group,
      },
      home: home?.name ?? 'Casa',
      away: away?.name ?? 'Ospite',
      scheduledAt: fixture.scheduledAt,
      venue: fixture.venue,
      round: fixture.round,
      liveUpdates: policy.includeLive,
      phase: fixture.cancelled
        ? 'cancelled'
        : summary?.state === 'final_confirmed'
          ? 'finished'
          : (progress?.phase ??
            (selected?.state === 'period_confirmed'
              ? 'interval'
              : selected
                ? 'live'
                : 'scheduled')),
      certification: summary?.homologatedAt
        ? 'homologated'
        : selected?.state === 'provisional'
          ? 'provisional'
          : selected
            ? 'referee_confirmed'
            : 'awaiting',
      score: selected ? { home: selected.homeScore, away: selected.awayScore } : null,
      period: selected?.period ?? null,
      revision: selected?.revision ?? 0,
      publicationVersion: policy.revision,
      updatedAt: selected?.createdAt ?? fixture.updatedAt,
      events,
    };
  }
  async clock(id: string, body: Record<string, unknown>) {
    const fixture = await this.fixtureAccess(id, true);
    if (fixture.cancelled) throw new PlatformError(409, 'Gara annullata.');
    if (
      (await this.app.repositories.recognitions.getWorkflowByMatch(fixture.matchId)).status !==
      'locked'
    )
      throw new PlatformError(409, 'Completa il riconoscimento prima di avviare la gara.');
    if (
      (await this.app.repositories.matchReports.findByMatch(fixture.matchId))?.status ===
        'submitted' ||
      (await this.db.get<GameSummary>('summaries', id))?.state === 'final_confirmed'
    )
      throw new PlatformError(409, 'Gara già conclusa.');
    const operationId = text(body, 'operationId', 80),
      fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      key = stableId('clock-op', id, operationId);
    const prior = await this.db.get<Entity & { fingerprint: string }>('clock_operations', key);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new PlatformError(409, 'Operazione già usata con altri dati.');
      return this.db.get<MatchProgress>('progress', id);
    }
    const previous = await this.db.get<MatchProgress>('progress', id);
    if (Number(body.revision) !== (previous?.revision ?? 0))
      throw new PlatformError(409, 'Orologio aggiornato: ricarica.');
    const action = text(body, 'action');
    if (!['start', 'pause', 'resume', 'suspend'].includes(action))
      throw new PlatformError(400, 'Comando non valido.');
    if (
      (action === 'start' && previous?.phase === 'live') ||
      (action === 'resume' && !previous) ||
      (['pause', 'suspend'].includes(action) && !previous)
    )
      throw new PlatformError(409, 'Transizione orologio non valida.');
    const summary = await this.db.get<GameSummary>('summaries', id),
      period = summary?.state === 'period_confirmed' ? summary.period + 1 : (summary?.period ?? 1),
      now = new Date().toISOString();
    const competition = (await this.db.get<Competition>('competitions', fixture.competitionId))!;
    if (period > competition.rules.periods) throw new PlatformError(409, 'Conferma la fine gara.');
    const seconds =
      action === 'start'
        ? 0
        : (previous?.seconds ?? 0) +
          (previous?.runningSince
            ? Math.max(0, Math.floor((Date.now() - Date.parse(previous.runningSince)) / 1000))
            : 0);
    const match = await this.app.repositories.matches.findById(fixture.matchId);
    if (action === 'start' && match?.status === 'scheduled')
      await this.app.services.matches.transitionMatchStatus(match.id, 'in_progress');
    const row = await this.db.put<MatchProgress>('progress', {
      id,
      fixtureId: id,
      phase: action === 'suspend' ? 'suspended' : 'live',
      period,
      seconds,
      runningSince: ['start', 'resume'].includes(action) ? now : null,
      revision: (previous?.revision ?? 0) + 1,
    });
    await this.db.put<MatchProgress & { fingerprint: string; action: string; actorId: string }>(
      'clock_operations',
      { ...row, id: key, fingerprint, action, actorId: this.auth.actorId },
    );
    return row;
  }
}
