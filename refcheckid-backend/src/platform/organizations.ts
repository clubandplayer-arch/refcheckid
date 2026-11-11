import { randomBytes, createHash } from 'node:crypto';
import type { CloudProfile } from '../cloud/supabase-auth.js';
import type { AuthContext } from '../api/http.js';
import type { ApplicationContainer } from '../config/application-container.js';
import { PlatformStore, stableId } from './store.js';
import {
  capabilities,
  roles,
  type Capability,
  type Role,
  type Organization,
  type Unit,
  type Membership,
  type Competition,
  type Delegation,
  type Invitation,
  type Official,
} from './types.js';
export class PlatformError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}
export const text = (body: Record<string, unknown>, key: string, max = 200) => {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new PlatformError(400, `Campo ${key}: valore richiesto.`);
  return value.trim();
};
export const optional = (body: Record<string, unknown>, key: string, max = 200) =>
  body[key] === undefined || body[key] === '' || body[key] === null ? '' : text(body, key, max);
export const timestamp = (value: string) => {
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value.slice(0, 10)).toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    throw new PlatformError(400, 'Data e ora con fuso orario richieste.');
  return new Date(value).toISOString();
};
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export class Organizations {
  readonly db: PlatformStore;
  private readonly scopeCache = new Map<string, Organization>();
  constructor(
    readonly app: ApplicationContainer,
    readonly auth: AuthContext,
  ) {
    this.db = new PlatformStore(app.store);
  }
  protected resetScopeCache() {
    this.scopeCache.clear();
  }
  async context() {
    const memberships = await this.db.find<Membership>('memberships', {
      actorId: this.auth.actorId,
      active: true,
    });
    const organizations: Organization[] = [];
    for (const id of new Set(memberships.map((m) => m.organizationId))) {
      const org = await this.db.get<Organization>('organizations', id);
      if (org) organizations.push(org);
    }
    const legacy = [];
    for (const id of this.auth.federationIds ?? []) {
      const federation = await this.app.repositories.federations.findById(id);
      if (federation) legacy.push({ id, name: federation.name });
    }
    return { organizations, memberships, legacyFederations: legacy, roles };
  }
  async create(body: Record<string, unknown>) {
    if (
      !this.auth.roles.includes('admin') &&
      !(this.auth.roles.includes('federation') && (this.auth.federationIds?.length ?? 0) > 0)
    )
      throw new PlatformError(403, 'Solo un operatore federale può creare un ente.');
    const name = text(body, 'name');
    const kind = body.kind === 'refereeing' ? 'refereeing' : 'sports';
    const federationId = optional(body, 'federationId');
    if (kind === 'refereeing' && federationId)
      throw new PlatformError(
        400,
        'Il collegamento a una federazione esistente è riservato agli enti sportivi. Crea l’organizzazione arbitrale senza questo collegamento.',
      );
    if (
      federationId &&
      !this.auth.roles.includes('admin') &&
      !this.auth.federationIds?.includes(federationId)
    )
      throw new PlatformError(403, 'Federazione fuori competenza.');
    const id = federationId || crypto.randomUUID();
    if (await this.db.get('organizations', id))
      throw new PlatformError(409, 'Ente già configurato: chiedi un invito a un amministratore.');
    if (kind === 'sports' && !federationId)
      await this.app.repositories.federations.create({
        id,
        name,
        fiscalCode: null,
        status: 'active',
      });
    const rootUnitId = stableId('root', id);
    const org = await this.db.put<Organization>('organizations', {
      id,
      name,
      kind,
      federationId: kind === 'sports' ? id : null,
      rootUnitId,
    });
    await this.db.put<Unit>('units', {
      id: rootUnitId,
      organizationId: id,
      parentId: null,
      name,
      kind: 'national',
      territory: '',
    });
    await this.db.put<Membership>('memberships', {
      organizationId: id,
      unitId: rootUnitId,
      actorId: this.auth.actorId,
      role: 'org_admin',
      active: true,
      descendants: true,
    });
    return org;
  }
  async scope(organizationId: string, unitId: string, action: Capability) {
    const cacheKey = JSON.stringify([organizationId, unitId, action]);
    const cached = this.scopeCache.get(cacheKey);
    if (cached) return cached;
    const org = await this.db.get<Organization>('organizations', organizationId);
    const unit = await this.db.get<Unit>('units', unitId);
    if (!org || !unit || unit.organizationId !== organizationId)
      throw new PlatformError(404, 'Struttura non trovata.');
    if (this.auth.roles.includes('admin')) return org;
    const memberships = await this.db.find<Membership>('memberships', {
      organizationId,
      actorId: this.auth.actorId,
      active: true,
    });
    const ancestors = new Set([unit.id]);
    let parent = unit.parentId;
    let depth = 0;
    while (parent) {
      if (ancestors.has(parent) || ++depth > 32)
        throw new PlatformError(409, 'Gerarchia non valida.');
      ancestors.add(parent);
      parent = (await this.db.get<Unit>('units', parent))?.parentId ?? null;
    }
    if (
      !memberships.some(
        (m) =>
          capabilities[m.role].includes(action) &&
          (m.unitId === unitId || (m.descendants && ancestors.has(m.unitId))),
      )
    )
      throw new PlatformError(403, 'Operazione fuori dalle tue competenze.');
    this.scopeCache.set(cacheKey, org);
    return org;
  }
  async units(orgId: string) {
    const rows = await this.db.find<Unit>('units', { organizationId: orgId });
    const visible = [];
    for (const unit of rows) {
      try {
        await this.scope(orgId, unit.id, 'read');
        visible.push(unit);
      } catch (error) {
        if (!(error instanceof PlatformError && error.status === 403)) throw error;
      }
    }
    return visible;
  }
  async createUnit(body: Record<string, unknown>) {
    const organizationId = text(body, 'organizationId');
    const parentId = text(body, 'parentId');
    await this.scope(organizationId, parentId, 'structure');
    const name = text(body, 'name'),
      kind = text(body, 'kind'),
      territory = optional(body, 'territory');
    const id = stableId('unit', organizationId, parentId, name, kind, territory);
    const previous = await this.db.get<Unit>('units', id);
    return (
      previous ??
      this.db.put<Unit>('units', { id, organizationId, parentId, name, kind, territory })
    );
  }
  async revokeMembership(id: string) {
    const row = await this.db.get<Membership>('memberships', id);
    if (!row) throw new PlatformError(404, 'Operatore non trovato.');
    await this.scope(row.organizationId, row.unitId, 'structure');
    if (row.actorId === this.auth.actorId)
      throw new PlatformError(409, 'Non puoi revocare il tuo stesso accesso da questa schermata.');
    const revoked = await this.db.update<Membership>('memberships', id, { active: false });
    if (row.clubId) {
      const remaining = await this.db.find<Membership>('memberships', {
        actorId: row.actorId,
        clubId: row.clubId,
        active: true,
      });
      if (!remaining.length) {
        const profiles = this.app.store.find
          ? await this.app.store.find<CloudProfile>('auth_profiles', { actorId: row.actorId })
          : (await this.app.store.list<CloudProfile>('auth_profiles')).filter(
              (profile) => profile.actorId === row.actorId,
            );
        for (const profile of profiles)
          if (profile.managedClubIds?.includes(row.clubId))
            await this.app.store.put('auth_profiles', {
              ...profile,
              clubIds: (profile.clubIds ?? []).filter((clubId) => clubId !== row.clubId),
            });
      }
    }
    return revoked;
  }
  async competition(id: string, action: 'read' | 'designate' | 'competitions' | 'results') {
    const competition = await this.db.get<Competition>('competitions', id);
    if (!competition) throw new PlatformError(404, 'Competizione non trovata.');
    try {
      await this.scope(competition.organizationId, competition.unitId, action);
      return competition;
    } catch (error) {
      if (
        !(error instanceof PlatformError && error.status === 403) ||
        !['read', 'designate'].includes(action)
      )
        throw error;
    }
    const delegations = await this.db.find<Delegation>('delegations', {
      competitionId: id,
      active: true,
    });
    for (const grant of delegations) {
      if (
        grant.expiresAt <= new Date().toISOString() ||
        !grant.actions.includes(action as 'read' | 'designate')
      )
        continue;
      try {
        await this.scope(grant.recipientOrganizationId, grant.recipientUnitId, action);
        return competition;
      } catch (error) {
        if (!(error instanceof PlatformError && error.status === 403)) throw error;
      }
    }
    throw new PlatformError(403, 'Competizione non delegata alla tua struttura.');
  }
  async createDelegation(body: Record<string, unknown>) {
    const competition = await this.competition(text(body, 'competitionId'), 'competitions');
    await this.scope(competition.organizationId, competition.unitId, 'structure');
    const recipientOrganizationId = text(body, 'recipientOrganizationId');
    const recipientUnitId = text(body, 'recipientUnitId');
    const recipient = await this.db.get<Unit>('units', recipientUnitId);
    if (!recipient || recipient.organizationId !== recipientOrganizationId)
      throw new PlatformError(400, 'Struttura destinataria non valida.');
    return this.db.put<Delegation>('delegations', {
      unitId: competition.unitId,
      organizationId: competition.organizationId,
      competitionId: competition.id,
      recipientOrganizationId,
      recipientUnitId,
      actions: body.designate === true ? ['read', 'designate'] : ['read'],
      active: true,
      expiresAt: timestamp(text(body, 'expiresAt')),
    });
  }
  async revokeDelegation(id: string) {
    const grant = await this.db.get<Delegation>('delegations', id);
    if (!grant) throw new PlatformError(404, 'Delega non trovata.');
    await this.competition(grant.competitionId, 'competitions');
    await this.scope(
      grant.organizationId,
      (await this.db.get<Competition>('competitions', grant.competitionId))!.unitId,
      'structure',
    );
    return this.db.update<Delegation>('delegations', id, { active: false });
  }
  async createInvitation(body: Record<string, unknown>) {
    const organizationId = text(body, 'organizationId');
    let unitId = text(body, 'unitId');
    await this.scope(organizationId, unitId, body.role === 'referee' ? 'people' : 'structure');
    const role = text(body, 'role') as Role;
    if (!roles.includes(role)) throw new PlatformError(400, 'Ruolo non valido.');
    const email = optional(body, 'email').toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new PlatformError(400, 'Email non valida.');
    const officialId = optional(body, 'officialId');
    const clubId = optional(body, 'clubId');
    if (role === 'referee') {
      const official = await this.db.get<Official>('officials', officialId);
      if (!official || official.organizationId !== organizationId)
        throw new PlatformError(400, 'Seleziona un arbitro della struttura.');
      await this.scope(organizationId, official.unitId, 'people');
      unitId = official.unitId;
      if (official.actorId)
        throw new PlatformError(
          409,
          'Arbitro già attivo: usa Recupera accesso se ha perso la password.',
        );
      const outstanding = await this.db.find<Invitation>('invitations', {
        officialId,
        status: 'pending',
      });
      if (outstanding.some((row) => row.expiresAt > new Date().toISOString()))
        throw new PlatformError(
          409,
          'Esiste già un invito valido per questo arbitro. Revocalo prima di rigenerarlo.',
        );
    }
    if (role === 'club_manager') {
      const org = await this.db.get<Organization>('organizations', organizationId);
      const club = await this.app.repositories.clubs.findById(clubId);
      if (!club || club.federationId !== org?.federationId)
        throw new PlatformError(400, 'Società fuori competenza.');
    }
    const token = randomBytes(32).toString('base64url');
    const code = `RC-${randomBytes(6).toString('hex').toUpperCase()}`;
    const invitation = await this.db.put<Invitation>('invitations', {
      organizationId,
      unitId,
      email: email || null,
      displayName: text(body, 'displayName'),
      role,
      officialId: officialId || null,
      clubId: clubId || null,
      code,
      descendants: typeof body.descendants === 'boolean' ? body.descendants : role === 'org_admin',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      status: 'pending',
      actorId: null,
    });
    return {
      id: invitation.id,
      code,
      token,
      expiresAt: invitation.expiresAt,
      activationPath: `/activate#${token}`,
      delivery: 'manual' as const,
    };
  }
  async recoverOfficial(id: string) {
    const official = await this.db.get<Official>('officials', id);
    if (!official?.actorId) throw new PlatformError(404, 'Arbitro non ancora attivato.');
    await this.scope(official.organizationId, official.unitId, 'structure');
    const activeMemberships = await this.db.find<Membership>('memberships', {
      organizationId: official.organizationId,
      actorId: official.actorId,
      role: 'referee',
      active: true,
    });
    if (!activeMemberships.some((m) => m.refereeId === official.refereeId))
      throw new PlatformError(
        409,
        'Appartenenza revocata: il recupero password non può riattivarla.',
      );
    const profiles = this.app.store.find
      ? await this.app.store.find<{ id: string; actorId: string; email: string }>('auth_profiles', {
          actorId: official.actorId,
        })
      : (
          await this.app.store.list<{ id: string; actorId: string; email: string }>('auth_profiles')
        ).filter((p) => p.actorId === official.actorId);
    const profile = profiles[0];
    if (!profile) throw new PlatformError(404, 'Account non trovato.');
    const previous = (
      await this.db.find<Invitation>('invitations', { officialId: id, status: 'accepted' })
    )[0];
    if (!previous)
      throw new PlatformError(
        409,
        'Recupero automatico non disponibile per questo account storico.',
      );
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.db.put<Invitation>('invitations', {
      organizationId: official.organizationId,
      unitId: official.unitId,
      email: profile.email.endsWith('@login.refcheckid.invalid') ? null : profile.email,
      displayName: `${official.firstName} ${official.lastName}`,
      role: 'referee',
      officialId: id,
      clubId: null,
      code: previous.code,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      status: 'pending',
      actorId: null,
      recoveryProfileId: profile.id,
    });
    return {
      id: invitation.id,
      code: previous.code,
      token,
      expiresAt: invitation.expiresAt,
      activationPath: `/activate#${token}`,
      delivery: 'manual',
      message:
        'Consegnare solo dopo avere verificato l’identità dell’arbitro. Le sessioni precedenti saranno revocate al completamento.',
    };
  }
  async revokeInvitation(id: string) {
    const row = await this.db.get<Invitation>('invitations', id);
    if (!row) throw new PlatformError(404, 'Invito non trovato.');
    await this.scope(
      row.organizationId,
      row.unitId,
      row.role === 'referee' ? 'people' : 'structure',
    );
    if (
      row.status === 'reserved' &&
      row.reservedAt &&
      Date.parse(row.reservedAt) > Date.now() - 90000
    )
      throw new PlatformError(
        409,
        'Attivazione in corso: attendi il completamento prima di revocare.',
      );
    if (row.status === 'accepted')
      throw new PlatformError(409, 'Revoca l’appartenenza dell’operatore già attivo.');
    return this.db.update<Invitation>('invitations', id, { status: 'revoked' });
  }
}
