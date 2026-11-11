import { Catalog } from './catalog.js';
import { PlatformError, text, optional, timestamp } from './organizations.js';
import type { PlatformStore } from './store.js';
import type {
  Appointment,
  Delegation,
  Fixture,
  Official,
  Unit,
  Membership,
  Notification,
  Unavailability,
} from './types.js';
export async function inside(db: PlatformStore, child: string, parent: string) {
  let id: string | null = child;
  for (let n = 0; id && n < 33; n++) {
    if (id === parent) return true;
    id = (await db.get<Unit>('units', id))?.parentId ?? null;
  }
  return false;
}
export async function officialDelegated(
  db: PlatformStore,
  fixture: Fixture,
  official: Official,
  delegationId?: string | null,
) {
  if (delegationId) {
    const grant = await db.get<Delegation>('delegations', delegationId);
    return (
      !!grant &&
      grant.active &&
      grant.competitionId === fixture.competitionId &&
      grant.recipientOrganizationId === official.organizationId &&
      grant.expiresAt > new Date().toISOString() &&
      grant.actions.includes('designate') &&
      (await inside(db, official.unitId, grant.recipientUnitId))
    );
  }
  if (official.organizationId === fixture.organizationId) return true;
  for (const grant of await db.find<Delegation>('delegations', {
    competitionId: fixture.competitionId,
    recipientOrganizationId: official.organizationId,
    active: true,
  })) {
    if (
      grant.expiresAt > new Date().toISOString() &&
      grant.actions.includes('designate') &&
      (await inside(db, official.unitId, grant.recipientUnitId))
    )
      return true;
  }
  return false;
}
export async function appointmentValid(db: PlatformStore, row: Appointment, actorId: string) {
  if (row.status !== 'accepted' || row.actorId !== actorId) return false;
  const fixture = await db.get<Fixture>('fixtures', row.fixtureId),
    official = await db.get<Official>('officials', row.officialId);
  if (
    !fixture ||
    fixture.cancelled ||
    row.fixtureRevision !== fixture.revision ||
    !official?.active ||
    official.actorId !== actorId
  )
    return false;
  const memberships = await db.find<Membership>('memberships', {
    actorId,
    organizationId: official.organizationId,
    role: 'referee',
    active: true,
  });
  if (!memberships.some((m) => m.refereeId === official.refereeId && m.unitId === official.unitId))
    return false;
  return officialDelegated(db, fixture, official, row.delegationId);
}
export class Appointments extends Catalog {
  async notify(row: Appointment, message: string) {
    return this.db.put<Notification>('notifications', {
      organizationId: row.organizationId,
      actorId: row.actorId,
      officialId: row.officialId,
      appointmentId: row.id,
      message,
      readAt: null,
      channel: 'in_app',
      status: 'available',
    });
  }
  async checkOverlap(officialId: string, fixture: Fixture, excludeId?: string) {
    const begin = Date.parse(fixture.scheduledAt),
      end = begin + fixture.durationMinutes * 60000;
    for (const unavailable of await this.db.find<Unavailability>('unavailability', { officialId }))
      if (Date.parse(unavailable.from) < end && Date.parse(unavailable.until) > begin)
        throw new PlatformError(409, 'Arbitro indisponibile in questa fascia oraria.');
    for (const row of await this.db.find<Appointment>('appointments', { officialId })) {
      if (row.id === excludeId || !['invited', 'accepted'].includes(row.status)) continue;
      const other = await this.db.get<Fixture>('fixtures', row.fixtureId);
      if (
        other &&
        !other.cancelled &&
        Date.parse(other.scheduledAt) < end &&
        Date.parse(other.scheduledAt) + other.durationMinutes * 60000 > begin
      )
        throw new PlatformError(409, 'Arbitro già designato in una fascia sovrapposta.');
    }
  }
  async createAppointment(body: Record<string, unknown>, validateOnly = false) {
    const fixture = await this.db.get<Fixture>('fixtures', text(body, 'fixtureId'));
    if (!fixture || fixture.cancelled) throw new PlatformError(404, 'Gara non disponibile.');
    const competition = await this.competition(fixture.competitionId, 'designate');
    const official = await this.db.get<Official>('officials', text(body, 'officialId'));
    if (!official?.active || !official.sports.includes(competition.sport))
      throw new PlatformError(400, 'Arbitro non abilitato alla disciplina.');
    await this.scope(official.organizationId, official.unitId, 'designate');
    let delegationId: string | null = null,
      owns = false;
    if (official.organizationId === fixture.organizationId) {
      try {
        await this.scope(competition.organizationId, competition.unitId, 'designate');
        owns = true;
      } catch (error) {
        if (!(error instanceof PlatformError && error.status === 403)) throw error;
      }
    }
    if (!owns) {
      for (const grant of await this.db.find<Delegation>('delegations', {
        competitionId: competition.id,
        recipientOrganizationId: official.organizationId,
        active: true,
      })) {
        if (
          grant.expiresAt <= new Date().toISOString() ||
          !grant.actions.includes('designate') ||
          !(await inside(this.db, official.unitId, grant.recipientUnitId))
        )
          continue;
        try {
          await this.scope(official.organizationId, grant.recipientUnitId, 'designate');
          delegationId = grant.id;
          break;
        } catch (error) {
          if (!(error instanceof PlatformError && error.status === 403)) throw error;
        }
      }
      if (!delegationId)
        throw new PlatformError(403, 'La sezione dell’arbitro non è delegata a questo campionato.');
    }

    const role = text(body, 'role');
    if (!['principal', 'assistant', 'table'].includes(role))
      throw new PlatformError(400, 'Incarico non valido.');
    const status: Appointment['status'] = body.send === true ? 'invited' : 'draft';
    for (const row of await this.db.find<Appointment>('appointments', { fixtureId: fixture.id }))
      if (
        ['invited', 'accepted', 'draft'].includes(row.status) &&
        (row.officialId === official.id || (role === 'principal' && row.role === 'principal'))
      )
        throw new PlatformError(
          409,
          'Designazione già presente. Revoca la precedente prima di sostituirla.',
        );
    if (status === 'invited') await this.checkOverlap(official.id, fixture);
    const input = {
      delegationId,
      organizationId: official.organizationId,
      ownerOrganizationId: fixture.organizationId,
      unitId: official.unitId,
      competitionId: competition.id,
      fixtureId: fixture.id,
      officialId: official.id,
      refereeId: official.refereeId,
      actorId: official.actorId,
      role: role as Appointment['role'],
      status,
      fixtureRevision: fixture.revision,
      notes: optional(body, 'notes', 2000),
      changedBy: this.auth.actorId,
    };
    if (validateOnly)
      return {
        ...input,
        id: 'preview',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as Appointment;
    const row = await this.db.put<Appointment>('appointments', input);
    if (status === 'invited')
      await this.notify(row, 'Nuova designazione: conferma la tua disponibilità.');
    return row;
  }
  async changeAppointment(id: string, body: Record<string, unknown>) {
    const row = await this.db.get<Appointment>('appointments', id);
    if (!row) throw new PlatformError(404, 'Designazione non trovata.');
    const fixture = await this.db.get<Fixture>('fixtures', row.fixtureId);
    if (!fixture) throw new PlatformError(404, 'Gara non trovata.');
    const action = text(body, 'action');
    let status: Appointment['status'];
    if (action === 'accept' || action === 'decline') {
      const official = await this.db.get<Official>('officials', row.officialId);
      if (
        !official ||
        official.actorId !== this.auth.actorId ||
        !official.active ||
        !(await officialDelegated(this.db, fixture, official, row.delegationId))
      )
        throw new PlatformError(403, 'Designazione non valida per questo arbitro.');
      const membership = await this.db.find<Membership>('memberships', {
        actorId: this.auth.actorId,
        organizationId: row.organizationId,
        role: 'referee',
        active: true,
      });
      if (!membership.some((m) => m.refereeId === row.refereeId))
        throw new PlatformError(403, 'Appartenenza arbitrale non attiva.');
      if (row.status !== 'invited')
        throw new PlatformError(409, 'La designazione non è in attesa di risposta.');
      if (fixture.cancelled) throw new PlatformError(409, 'Gara annullata.');
      if (action === 'accept') {
        await this.checkOverlap(row.officialId, fixture, row.id);
        status = 'accepted';
      } else status = 'declined';
    } else {
      await this.competition(row.competitionId, 'designate');
      await this.scope(row.organizationId, row.unitId, 'designate');
      if (action === 'send' && row.status === 'draft') {
        await this.checkOverlap(row.officialId, fixture, row.id);
        status = 'invited';
      } else if (action === 'revoke' && !['revoked', 'declined'].includes(row.status))
        status = 'revoked';
      else throw new PlatformError(409, 'Transizione della designazione non valida.');
    }
    const changed = await this.db.update<Appointment>('appointments', id, {
      status,
      actorId: action === 'accept' ? this.auth.actorId : row.actorId,
      fixtureRevision: fixture.revision,
      notes: optional(body, 'notes', 2000) || row.notes,
      changedBy: this.auth.actorId,
    });
    if (row.role === 'principal')
      await this.app.repositories.matches.update(fixture.matchId, {
        refereeId: status === 'accepted' ? row.refereeId : null,
      });
    if (status === 'accepted') await this.updateLegacyAccess(changed, fixture.matchId);
    await this.notify(changed, `Designazione aggiornata: ${status}.`);
    return changed;
  }
  async updateLegacyAccess(row: Appointment, matchId: string) {
    const profiles = this.app.store.find
      ? await this.app.store.find<{
          id: string;
          actorId: string;
          refereeIds?: string[];
          authorizedMatchIds?: string[];
        }>('auth_profiles', { actorId: row.actorId })
      : (
          await this.app.store.list<{
            id: string;
            actorId: string;
            refereeIds?: string[];
            authorizedMatchIds?: string[];
          }>('auth_profiles')
        ).filter((profile) => profile.actorId === row.actorId);
    for (const profile of profiles)
      await this.app.store.put('auth_profiles', {
        ...profile,
        refereeIds: [...new Set([...(profile.refereeIds ?? []), row.refereeId])],
        authorizedMatchIds: [...new Set([...(profile.authorizedMatchIds ?? []), matchId])],
      });
  }
  async mine(cursor?: string) {
    const page = await this.db.page<Appointment>(
      'appointments',
      { actorId: this.auth.actorId },
      cursor,
    );
    const rows = page.items;
    const items = [];
    for (const row of rows) {
      const fixture = await this.db.get<Fixture>('fixtures', row.fixtureId);
      if (!fixture) continue;
      const valid = await appointmentValid(this.db, row, this.auth.actorId);
      const official = await this.db.get<Official>('officials', row.officialId);
      const delegated = official
        ? await officialDelegated(this.db, fixture, official, row.delegationId)
        : false;
      items.push({ ...row, fixture, operational: valid, delegationActive: delegated });
    }
    return {
      ...page,
      items: items.sort((a, b) => a.fixture.scheduledAt.localeCompare(b.fixture.scheduledAt)),
    };
  }
  async changeFixture(id: string, body: Record<string, unknown>) {
    const fixture = await this.db.get<Fixture>('fixtures', id);
    if (!fixture) throw new PlatformError(404, 'Gara non trovata.');
    await this.competition(fixture.competitionId, 'competitions');
    if (Number(body.revision) !== fixture.revision)
      throw new PlatformError(409, 'Calendario modificato da un altro operatore. Ricarica.');
    const match = await this.app.repositories.matches.findById(fixture.matchId);
    if (match?.status !== 'scheduled')
      throw new PlatformError(
        409,
        'Una gara iniziata non può essere spostata da questa schermata.',
      );
    const reason = text(body, 'reason', 2000);
    const scheduledAt = body.scheduledAt
      ? timestamp(text(body, 'scheduledAt'))
      : fixture.scheduledAt;
    const changed = await this.db.update<Fixture>('fixtures', id, {
      scheduledAt,
      venue: optional(body, 'venue') || fixture.venue,
      cancelled: body.cancelled === true,
      revision: fixture.revision + 1,
    });
    await this.app.repositories.matches.update(fixture.matchId, {
      scheduledAt,
      venue: changed.venue,
      status: changed.cancelled ? 'cancelled' : 'scheduled',
      refereeId: null,
    });
    for (const row of await this.db.find<Appointment>('appointments', { fixtureId: id }))
      if (['invited', 'accepted'].includes(row.status)) {
        const updated = await this.db.update<Appointment>('appointments', row.id, {
          status: changed.cancelled ? 'revoked' : 'invited',
          fixtureRevision: changed.revision,
          notes: reason,
          changedBy: this.auth.actorId,
        });
        await this.notify(
          updated,
          `Variazione calendario: ${reason}. È richiesta una nuova conferma.`,
        );
      }
    return changed;
  }
  async setOfficialStatus(id: string, active: boolean) {
    const official = await this.db.get<Official>('officials', id);
    if (!official) throw new PlatformError(404, 'Arbitro non trovato.');
    await this.scope(official.organizationId, official.unitId, 'people');
    const updated = await this.db.update<Official>('officials', id, { active });
    if (!active)
      for (const appointment of await this.db.find<Appointment>('appointments', { officialId: id }))
        if (['draft', 'invited', 'accepted'].includes(appointment.status)) {
          const revoked = await this.db.update<Appointment>('appointments', appointment.id, {
            status: 'revoked',
            changedBy: this.auth.actorId,
            notes: 'Anagrafica arbitrale disattivata dalla struttura',
          });
          if (appointment.role === 'principal') {
            const fixture = await this.db.get<Fixture>('fixtures', appointment.fixtureId);
            if (fixture)
              await this.app.repositories.matches.update(fixture.matchId, { refereeId: null });
          }
          await this.notify(revoked, 'Designazione revocata: anagrafica arbitrale non attiva.');
        }
    return updated;
  }
  async addUnavailability(body: Record<string, unknown>) {
    const official = await this.db.get<Official>('officials', text(body, 'officialId'));
    if (!official) throw new PlatformError(404, 'Arbitro non trovato.');
    if (official.actorId !== this.auth.actorId)
      await this.scope(official.organizationId, official.unitId, 'designate');
    const from = timestamp(text(body, 'from')),
      until = timestamp(text(body, 'until'));
    if (from >= until) throw new PlatformError(400, 'Intervallo non valido.');
    return this.db.put<Unavailability>('unavailability', {
      organizationId: official.organizationId,
      officialId: official.id,
      from,
      until,
      notes: optional(body, 'notes', 1000),
    });
  }
}
