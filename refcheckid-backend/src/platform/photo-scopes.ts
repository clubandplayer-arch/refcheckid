import type { ApplicationContainer } from '../config/application-container.js';
import type { AuthContext } from '../api/http.js';
import type { PhotoApproval } from '../domain/index.js';
import { PlatformStore } from './store.js';
import { inside } from './appointments.js';
import type { Membership, Organization } from './types.js';
import type { ClubRecord } from './catalog.js';
export async function reviewerScope(app: ApplicationContainer, auth: AuthContext) {
  if (auth.roles.includes('admin'))
    return { federationIds: null as string[] | null, clubIds: [] as string[] };
  const federationIds = [...(auth.roles.includes('federation') ? (auth.federationIds ?? []) : [])],
    clubIds: string[] = [];
  if (!auth.roles.includes('federation')) return { federationIds, clubIds };
  const db = new PlatformStore(app.store);
  for (const membership of await db.find<Membership>('memberships', {
    actorId: auth.actorId,
    active: true,
  })) {
    if (!['org_admin', 'photo_reviewer'].includes(membership.role)) continue;
    const org = await db.get<Organization>('organizations', membership.organizationId);
    if (!org?.federationId) continue;
    if (membership.unitId === org.rootUnitId && membership.descendants) {
      federationIds.push(org.federationId);
      continue;
    }
    for (const club of await db.find<ClubRecord>('clubs', { organizationId: org.id }))
      if (
        club.unitId === membership.unitId ||
        (membership.descendants && (await inside(db, club.unitId, membership.unitId)))
      )
        clubIds.push(club.clubId);
  }
  return { federationIds: [...new Set(federationIds)], clubIds: [...new Set(clubIds)] };
}
export async function canReview(
  app: ApplicationContainer,
  auth: AuthContext,
  approval: PhotoApproval,
) {
  const scope = await reviewerScope(app, auth);
  if (scope.federationIds === null || scope.federationIds.includes(approval.federationId))
    return true;
  if (!approval.registrationId) return false;
  const registration =
    (await app.repositories.registrations.findPlayerRegistrationById(approval.registrationId)) ??
    (await app.repositories.registrations.findStaffRegistrationById(approval.registrationId));
  if (!registration || !scope.clubIds.includes(registration.clubId)) return false;
  return (
    (await app.repositories.clubs.findById(registration.clubId))?.federationId ===
    approval.federationId
  );
}
