import { createHash } from 'node:crypto';
import { Appointments, appointmentValid } from './appointments.js';
import { PlatformError, text, optional } from './organizations.js';
import { stableId } from './store.js';
import type {
  Appointment,
  Fixture,
  GameEvent,
  GameSummary,
  PeriodUpdate,
  Competition,
} from './types.js';
export class Results extends Appointments {
  async fixtureAccess(id: string, write = false) {
    const fixture = await this.db.get<Fixture>('fixtures', id);
    if (!fixture) throw new PlatformError(404, 'Gara non trovata.');
    const mine = await this.db.find<Appointment>('appointments', {
      fixtureId: id,
      actorId: this.auth.actorId,
    });
    for (const row of mine)
      if (
        (!write || row.role === 'principal') &&
        (await appointmentValid(this.db, row, this.auth.actorId))
      )
        return fixture;
    if (write)
      throw new PlatformError(
        403,
        'Solo l’arbitro principale con designazione attiva può confermare i periodi.',
      );
    await this.competition(fixture.competitionId, 'read');
    return fixture;
  }
  async gameContext(id: string) {
    const fixture = await this.fixtureAccess(id);
    const competition = (await this.db.get<Competition>('competitions', fixture.competitionId))!;
    const match = (await this.app.repositories.matches.findById(fixture.matchId))!;
    const sheets = await this.app.repositories.matchSheets.listByMatch(match.id);
    const players = [];
    for (const sheet of sheets)
      for (const line of await this.app.repositories.matchSheetPlayers.listByMatchSheet(sheet.id)) {
        const registration = await this.app.repositories.registrations.findById(
          line.playerRegistrationId,
        );
        const player = registration
          ? await this.app.repositories.players.findById(registration.playerId)
          : null;
        players.push({
          registrationId: line.playerRegistrationId,
          clubId: sheet.clubId,
          name: player ? `${player.firstName} ${player.lastName}` : line.playerRegistrationId,
          shirtNumber: line.shirtNumber,
          role: line.role,
        });
      }
    const home = await this.app.repositories.clubs.findById(match.homeClubId),
      away = await this.app.repositories.clubs.findById(match.awayClubId);
    const summary = await this.db.get<GameSummary>('summaries', id);
    const last = summary
      ? await this.db.get<PeriodUpdate>('updates', stableId('update', id, summary.operationId))
      : null;
    return {
      fixture,
      competition,
      home: { id: match.homeClubId, name: home?.name ?? 'Casa' },
      away: { id: match.awayClubId, name: away?.name ?? 'Ospite' },
      players,
      summary,
      events: last?.events ?? [],
      report: await this.app.repositories.matchReports.findByMatch(match.id),
      serverTime: new Date().toISOString(),
    };
  }
  async submitGameReport(id: string, body: Record<string, unknown>) {
    const fixture = await this.fixtureAccess(id, true);
    const summary = await this.db.get<GameSummary>('summaries', id);
    if (!summary || summary.state !== 'final_confirmed')
      throw new PlatformError(
        409,
        'Conferma il risultato di fine gara prima di inviare il referto.',
      );
    const notes = optional(body, 'notes', 10000);
    const update = await this.db.get<PeriodUpdate>(
      'updates',
      stableId('update', id, summary.operationId),
    );
    const competition = (await this.db.get<Competition>('competitions', fixture.competitionId))!;
    const content = JSON.stringify({
      matchId: fixture.matchId,
      sport: competition.sport,
      result: { homeGoals: summary.homeScore, awayGoals: summary.awayScore },
      events: update?.events ?? [],
      goals: [],
      cautions: [],
      expulsions: [],
      substitutions: [],
      refereeNotes: notes,
      refereeName: this.auth.displayName ?? this.auth.actorId,
      source: 'confirmed_periods',
      resultRevision: summary.revision,
    });
    const existing = await this.app.repositories.matchReports.findByMatch(fixture.matchId);
    if (existing?.status === 'submitted') {
      if (existing.summary === content) return existing;
      throw new PlatformError(409, 'Referto già inviato.');
    }
    const match = await this.app.repositories.matches.findById(fixture.matchId);
    if (!match?.refereeId) throw new PlatformError(409, 'Designazione principale mancante.');
    if (match.status === 'scheduled')
      await this.app.services.matches.transitionMatchStatus(match.id, 'in_progress');
    if (match.status !== 'completed')
      await this.app.services.matches.transitionMatchStatus(match.id, 'completed');
    const report =
      existing ??
      (await this.app.services.matchReports.createMatchReport({
        matchId: match.id,
        refereeId: match.refereeId,
        summary: content,
      }));
    await this.app.services.matchReports.updateMatchReport(report.id, { summary: content });
    return this.app.services.matchReports.submitMatchReport(report.id);
  }
  async homologate(id: string) {
    const fixture = await this.db.get<Fixture>('fixtures', id);
    if (!fixture) throw new PlatformError(404, 'Gara non trovata.');
    await this.competition(fixture.competitionId, 'results');
    const summary = await this.db.get<GameSummary>('summaries', id),
      report = await this.app.repositories.matchReports.findByMatch(fixture.matchId);
    if (summary?.state !== 'final_confirmed' || report?.status !== 'submitted')
      throw new PlatformError(409, 'Per omologare servono risultato finale e referto inviato.');
    if (summary.homologatedAt) return summary;
    return this.db.update<GameSummary>('summaries', id, {
      homologatedAt: new Date().toISOString(),
      homologatedBy: this.auth.actorId,
    });
  }
  async submitPeriod(id: string, body: Record<string, unknown>) {
    const fixture = await this.fixtureAccess(id, body.state !== 'provisional');
    if (fixture.cancelled) throw new PlatformError(409, 'Gara annullata.');
    const operationId = text(body, 'operationId', 80);
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(operationId))
      throw new PlatformError(400, 'ID operazione non valido.');
    const key = stableId('update', id, operationId);
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const prior = await this.db.get<PeriodUpdate>('updates', key);
    if (prior) {
      if (prior.actorId !== this.auth.actorId || prior.fingerprint !== fingerprint)
        throw new PlatformError(409, 'ID operazione già usato con contenuti differenti.');
      return this.db.get<GameSummary>('summaries', id);
    }
    const previous = await this.db.get<GameSummary>('summaries', id);
    if (previous?.homologatedAt)
      throw new PlatformError(
        409,
        'Risultato già omologato. La rettifica richiede un intervento federale tracciato.',
      );
    if (Number(body.revision) !== (previous?.revision ?? 0))
      throw new PlatformError(
        409,
        'Risultato aggiornato da un altro dispositivo. Ricarica e confronta la tua bozza.',
      );
    const workflow = await this.app.repositories.recognitions.getWorkflowByMatch(fixture.matchId);
    if (workflow.status !== 'locked')
      throw new PlatformError(
        409,
        'Completa il riconoscimento prima degli aggiornamenti ufficiali.',
      );
    const report = await this.app.repositories.matchReports.findByMatch(fixture.matchId);
    if (report?.status === 'submitted' || report?.status === 'locked')
      throw new PlatformError(409, 'Referto già inviato: richiedi una rettifica alla federazione.');
    const competition = (await this.db.get<Competition>('competitions', fixture.competitionId))!;
    const period = Number(body.period);
    if (!Number.isInteger(period) || period < 1 || period > competition.rules.periods)
      throw new PlatformError(400, 'Periodo non valido.');
    if (
      period > (previous?.period ?? 0) + 1 ||
      (previous && period > previous.period && previous.state === 'provisional')
    )
      throw new PlatformError(409, 'Conferma il periodo precedente prima di proseguire.');
    const state = text(body, 'state') as PeriodUpdate['state'];
    if (!['provisional', 'period_confirmed', 'final_confirmed'].includes(state))
      throw new PlatformError(400, 'Stato non valido.');
    if (
      state === 'final_confirmed' &&
      competition.sport !== 'volleyball' &&
      period !== competition.rules.periods
    )
      throw new PlatformError(409, 'Conferma tutti i periodi previsti prima del risultato finale.');
    const correctionReason = optional(body, 'correctionReason', 2000);
    if (
      previous?.state === 'final_confirmed' &&
      state !== 'final_confirmed' &&
      correctionReason.length < 20
    )
      throw new PlatformError(
        400,
        'Per correggere un periodo confermato specifica una motivazione di almeno 20 caratteri.',
      );
    const context = await this.gameContext(id);
    const raw = body.events;
    if (!Array.isArray(raw) || raw.length > 1000)
      throw new PlatformError(400, 'Elenco eventi non valido (massimo 1000).');
    const events: GameEvent[] = [];
    const seen = new Set<string>();
    for (const value of raw) {
      if (!value || typeof value !== 'object') throw new PlatformError(400, 'Evento non valido.');
      const item = value as Record<string, unknown>;
      const eventId = text(item, 'id', 80);
      if (seen.has(eventId)) throw new PlatformError(400, 'Evento duplicato.');
      seen.add(eventId);
      const type = text(item, 'type') as GameEvent['type'];
      const allowed =
        competition.sport === 'football'
          ? ['goal', 'own_goal', 'yellow', 'red', 'substitution']
          : competition.sport === 'basketball'
            ? ['points', 'substitution']
            : ['set', 'substitution'];
      if (!allowed.includes(type))
        throw new PlatformError(400, 'Evento non previsto dalla disciplina.');
      const clubId = text(item, 'clubId');
      if (![context.home.id, context.away.id].includes(clubId))
        throw new PlatformError(400, 'Società fuori dalla gara.');
      const registrationId = optional(item, 'registrationId') || null,
        incomingRegistrationId = optional(item, 'incomingRegistrationId') || null;
      if (
        type !== 'set' &&
        !context.players.some((p) => p.registrationId === registrationId && p.clubId === clubId)
      )
        throw new PlatformError(400, 'Il giocatore non appartiene alla distinta della squadra.');
      if (
        type === 'substitution' &&
        (!incomingRegistrationId ||
          incomingRegistrationId === registrationId ||
          !context.players.some(
            (p) => p.registrationId === incomingRegistrationId && p.clubId === clubId,
          ))
      )
        throw new PlatformError(400, 'Sostituzione non valida.');
      const minute = Number(item.minute),
        stoppage = Number(item.stoppage ?? 0),
        eventPeriod = Number(item.period ?? period);
      if (
        !Number.isInteger(minute) ||
        minute < 0 ||
        minute > 300 ||
        !Number.isInteger(stoppage) ||
        stoppage < 0 ||
        stoppage > 60 ||
        !Number.isInteger(eventPeriod) ||
        eventPeriod < 1 ||
        eventPeriod > period
      )
        throw new PlatformError(400, 'Minuto o periodo dell’evento non valido.');
      const points =
        type === 'points'
          ? Number(item.points)
          : ['goal', 'own_goal', 'set'].includes(type)
            ? 1
            : 0;
      if (type === 'points' && ![1, 2, 3].includes(points))
        throw new PlatformError(400, 'Nel basket sono ammessi canestri da 1, 2 o 3 punti.');
      events.push({
        id: eventId,
        type,
        clubId,
        registrationId,
        incomingRegistrationId,
        minute,
        stoppage,
        points,
        period: eventPeriod,
      });
    }
    const confirmedOperation =
      previous?.lastConfirmedOperationId ??
      (previous && previous.state !== 'provisional' ? previous.operationId : undefined);
    const confirmedUpdate = confirmedOperation
      ? await this.db.get<PeriodUpdate>('updates', stableId('update', id, confirmedOperation))
      : null;
    if (confirmedUpdate) {
      const canonical = (items: GameEvent[]) =>
        JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)));
      if (
        canonical(events.filter((event) => event.period <= confirmedUpdate.period)) !==
          canonical(confirmedUpdate.events) &&
        correctionReason.length < 20
      )
        throw new PlatformError(
          400,
          'Per rettificare eventi di un periodo già confermato serve una motivazione di almeno 20 caratteri.',
        );
    }
    let homeScore = 0,
      awayScore = 0;
    for (const event of events) {
      const home = event.clubId === context.home.id;
      const creditedHome = event.type === 'own_goal' ? !home : home;
      if (['goal', 'own_goal', 'points', 'set'].includes(event.type)) {
        if (creditedHome) homeScore += event.points;
        else awayScore += event.points;
      }
    }
    if (Number(body.homeScore) !== homeScore || Number(body.awayScore) !== awayScore)
      throw new PlatformError(
        400,
        'Punteggio ed eventi non coincidono. Correggi il riepilogo prima di confermare.',
      );
    if (competition.sport === 'volleyball') {
      const winningSets = Math.floor(competition.rules.periods / 2) + 1;
      if (
        homeScore > winningSets ||
        awayScore > winningSets ||
        (homeScore === winningSets && awayScore === winningSets) ||
        homeScore + awayScore > period ||
        (state === 'final_confirmed' &&
          (Math.max(homeScore, awayScore) !== winningSets || homeScore + awayScore !== period))
      )
        throw new PlatformError(
          400,
          'Risultato set non valido per i periodi previsti dal campionato.',
        );
    }
    const revision = (previous?.revision ?? 0) + 1;
    await this.db.put<PeriodUpdate>('updates', {
      id: key,
      organizationId: fixture.organizationId,
      competitionId: fixture.competitionId,
      fixtureId: id,
      period,
      revision,
      homeScore,
      awayScore,
      events,
      state,
      actorId: this.auth.actorId,
      operationId,
      correctionReason: correctionReason || null,
      fingerprint,
    });
    const summary = await this.db.put<GameSummary>('summaries', {
      ...(previous ?? {}),
      id,
      organizationId: fixture.organizationId,
      competitionId: fixture.competitionId,
      fixtureId: id,
      revision,
      period,
      homeScore,
      awayScore,
      state,
      actorId: this.auth.actorId,
      confirmedAt: new Date().toISOString(),
      operationId,
      lastConfirmedPeriod: state === 'provisional' ? (previous?.lastConfirmedPeriod ?? 0) : period,
      lastConfirmedOperationId:
        state === 'provisional' ? (previous?.lastConfirmedOperationId ?? '') : operationId,
    });
    const match = await this.app.repositories.matches.findById(fixture.matchId);
    if (match?.status === 'scheduled')
      await this.app.repositories.matches.update(match.id, { status: 'in_progress' });
    return summary;
  }
}
