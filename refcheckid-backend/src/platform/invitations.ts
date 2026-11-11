import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import type { ApplicationContainer } from '../config/application-container.js';
import { cloudEnabled } from '../cloud/config.js';
import { supabaseRequest, SupabaseRequestError } from '../cloud/supabase-http.js';
import type { CloudProfile } from '../cloud/supabase-auth.js';
import { PlatformStore, stableId } from './store.js';
import { PlatformError, hashToken, text } from './organizations.js';
import type { Invitation, Membership, Official, Organization, Notification } from './types.js';

/** Provisioning spans short database transactions; never hold a DB lock during provider I/O. */
export async function activateInvitation(app: ApplicationContainer, body: Record<string, unknown>) {
  const token = text(body, 'token', 128),
    password = text(body, 'password', 128);
  if (password.length < 12)
    throw new PlatformError(400, 'Scegli una password di almeno 12 caratteri.');
  const db = new PlatformStore(app.store);
  const invite = await app.store.transaction(async () => {
    const rows = await db.find<Invitation>('invitations', { tokenHash: hashToken(token) });
    const row = rows[0];
    if (
      !row ||
      !['pending', 'reserved'].includes(row.status) ||
      row.expiresAt <= new Date().toISOString()
    )
      throw new PlatformError(400, 'Invito scaduto, revocato o già utilizzato.');
    if (
      row.status === 'reserved' &&
      row.reservedAt &&
      Date.parse(row.reservedAt) > Date.now() - 90000
    )
      throw new PlatformError(
        409,
        'Attivazione già in corso. Attendi 90 secondi prima di riprovare se la connessione è caduta.',
      );
    if ((row.attempts ?? 0) >= 10)
      throw new PlatformError(429, 'Troppi tentativi: chiedi un nuovo invito al responsabile.');
    const reservationId = randomUUID();
    await db.update<Invitation>('invitations', row.id, {
      status: 'reserved',
      attempts: (row.attempts ?? 0) + 1,
      reservationId,
      reservedAt: new Date().toISOString(),
    });
    return { ...row, reservationId };
  });
  const providerEmail = invite.email ?? `${invite.code.toLowerCase()}@login.refcheckid.invalid`;
  let providerId: string;
  let passwordHash: string | undefined;
  let verificationRequired = false;
  let verificationSent = false;
  if (cloudEnabled()) {
    if (invite.recoveryProfileId) {
      await supabaseRequest(`/auth/v1/admin/users/${invite.recoveryProfileId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      providerId = invite.recoveryProfileId;
    } else if (invite.provisionedProfileId) {
      providerId = invite.provisionedProfileId;
      await supabaseRequest(`/auth/v1/admin/users/${providerId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      verificationRequired = !!invite.email;
    } else
      try {
        const identity = (await (
          await supabaseRequest('/auth/v1/admin/users', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: providerEmail, password, email_confirm: !invite.email }),
          })
        ).json()) as { id: string };
        providerId = identity.id;
        await app.store.transaction(() =>
          db.update<Invitation>('invitations', invite.id, { provisionedProfileId: providerId }),
        );
        if (invite.email) {
          verificationRequired = true;
          try {
            await supabaseRequest('/auth/v1/resend', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ type: 'signup', email: providerEmail }),
            });
            verificationSent = true;
          } catch (error) {
            if (!(error instanceof SupabaseRequestError)) throw error;
          }
        }
      } catch (error) {
        if (!(error instanceof SupabaseRequestError && [400, 409, 422].includes(error.status)))
          throw error;
        // Existing account or a retry after provider success: require its password.
        const session = (await (
          await supabaseRequest('/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: providerEmail, password }),
          })
        ).json()) as { user?: { id: string } };
        if (!session.user?.id)
          throw new PlatformError(401, 'Accesso all’account esistente non riuscito.');
        providerId = session.user.id;
      }
  } else {
    const alias = await app.store.get<{ id: string; profileId: string }>(
      'platform_login_aliases',
      stableId('login', providerEmail.toLowerCase()),
    );
    providerId = invite.recoveryProfileId ?? alias?.profileId ?? randomUUID();
    const existing = await app.store.get<CloudProfile & { passwordHash?: string }>(
      'auth_profiles',
      providerId,
    );
    if (existing?.passwordHash && !invite.recoveryProfileId) {
      const [, salt, hash] = existing.passwordHash.split('$');
      if (scryptSync(password, salt, 64).toString('hex') !== hash)
        throw new PlatformError(401, 'Password dell’account esistente non valida.');
      passwordHash = existing.passwordHash;
    } else {
      const salt = randomBytes(16).toString('hex');
      passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
    }
  }
  await app.store.transaction(async () => {
    const current = await db.get<Invitation>('invitations', invite.id);
    if (
      !current ||
      current.status !== 'reserved' ||
      current.reservationId !== invite.reservationId ||
      current.expiresAt <= new Date().toISOString()
    )
      throw new PlatformError(
        409,
        'Invito non più utilizzabile. L’account non riceve accesso alla struttura.',
      );
    const existing = await app.store.get<CloudProfile>('auth_profiles', providerId);
    const actorId = existing?.actorId ?? randomUUID();
    const org = await db.get<Organization>('organizations', invite.organizationId);
    if (!org) throw new PlatformError(409, 'Ente non più disponibile.');
    const official = invite.officialId
      ? await db.get<Official>('officials', invite.officialId)
      : null;
    if (
      invite.role === 'referee' &&
      (!official || !official.active || (official.actorId && official.actorId !== actorId))
    )
      throw new PlatformError(409, 'Anagrafica arbitro già collegata o disabilitata.');
    const role =
      invite.role === 'referee'
        ? 'referee'
        : invite.role === 'club_manager'
          ? 'manager'
          : 'federation';
    const profile = {
      ...existing,
      id: providerId,
      actorId,
      email: providerEmail,
      displayName: existing?.displayName ?? invite.displayName,
      sessionVersion: (existing?.sessionVersion ?? 0) + (invite.recoveryProfileId ? 1 : 0),
      requiresBoundSessions: invite.recoveryProfileId
        ? true
        : (existing?.requiresBoundSessions ?? !existing),
      role: existing?.role ?? role,
      appRoles: [...new Set([...(existing?.appRoles ?? []), role])],
      enabled: existing?.enabled ?? true,
      managedClubIds: [
        ...new Set([
          ...(existing?.managedClubIds ?? []),
          ...(invite.clubId && !existing?.clubIds?.includes(invite.clubId) ? [invite.clubId] : []),
        ]),
      ],
      clubIds: [
        ...new Set([...(existing?.clubIds ?? []), ...(invite.clubId ? [invite.clubId] : [])]),
      ],
      clubFederationIds: {
        ...(existing?.clubFederationIds ?? {}),
        ...(invite.clubId && org.federationId ? { [invite.clubId]: org.federationId } : {}),
      },
      federationIds: existing?.federationIds ?? [],
      refereeIds: [
        ...new Set([...(existing?.refereeIds ?? []), ...(official ? [official.refereeId] : [])]),
      ],
      authorizedMatchIds: existing?.authorizedMatchIds ?? [],
      ...(passwordHash ? { passwordHash } : {}),
    };
    await app.store.put('auth_profiles', profile);
    for (const alias of [invite.code, providerEmail])
      await app.store.put('platform_login_aliases', {
        id: stableId('login', alias.toLowerCase()),
        email: providerEmail,
        profileId: providerId,
      });
    if (!invite.recoveryProfileId)
      await db.put<Membership>('memberships', {
        id: stableId('membership', invite.id),
        organizationId: invite.organizationId,
        unitId: invite.unitId,
        actorId,
        role: invite.role,
        active: true,
        descendants: invite.descendants ?? invite.role === 'org_admin',
        ...(official ? { refereeId: official.refereeId } : {}),
        ...(invite.clubId ? { clubId: invite.clubId } : {}),
      });
    if (official) {
      await db.update<Official>('officials', official.id, { actorId });
      const appointments = await db.find<{
        id: string;
        createdAt: string;
        updatedAt: string;
        deletedAt: null;
      }>('appointments', { officialId: official.id });
      for (const appointment of appointments)
        await db.update('appointments', appointment.id, {
          ...appointment,
          actorId,
        } as typeof appointment);
      for (const notice of await db.find<Notification>('notifications', {
        officialId: official.id,
        actorId: null,
      }))
        await db.update<Notification>('notifications', notice.id, { actorId });
    }
    await db.update<Invitation>('invitations', invite.id, { status: 'accepted', actorId });
    await app.store.put('platform_access_audit', {
      id: randomUUID(),
      actorId,
      organizationId: invite.organizationId,
      unitId: invite.unitId,
      invitationId: invite.id,
      action: invite.recoveryProfileId ? 'credential_recovery' : 'invitation_activation',
      createdAt: new Date().toISOString(),
    });
  });
  return {
    code: invite.code,
    login: invite.email ?? invite.code,
    verificationRequired,
    verificationSent,
    message: verificationRequired
      ? verificationSent
        ? 'Controlla l’email e conferma l’indirizzo prima di accedere.'
        : 'Account predisposto. La verifica email non è stata inviata: contatta il responsabile per verificare la configurazione email.'
      : 'Account attivato. Accedi con il tuo identificativo e la password scelta.',
  };
}
