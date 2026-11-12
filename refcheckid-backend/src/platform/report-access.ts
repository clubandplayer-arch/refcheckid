import type { ApplicationContainer } from '../config/application-container.js';
import type { AuthContext } from '../api/http.js';
import { Organizations, PlatformError } from './organizations.js';
import { appointmentValid } from './appointments.js';
import type { Appointment, Fixture } from './types.js';
/** Reports are private correspondence: a competition read/designation grant never authorizes them. */
export async function canReadReport(app: ApplicationContainer, auth: AuthContext, matchId: string) {
  const match = await app.repositories.matches.findById(matchId);
  if (!match) return false;
  if (auth.roles.includes('federation') && auth.federationIds?.includes(match.federationId))
    return true;
  const service = new Organizations(app, {
      ...auth,
      roles: auth.roles.filter((role) => role !== 'admin'),
    }),
    fixture = (await service.db.find<Fixture>('fixtures', { matchId }))[0];
  if (fixture) {
    try {
      const org = await service.scope(fixture.organizationId, fixture.unitId, 'reports');
      if (org.kind === 'sports') return true;
    } catch (error) {
      if (!(error instanceof PlatformError && [403, 404].includes(error.status))) throw error;
    }
    if (!auth.roles.includes('referee')) return false;
    for (const row of await service.db.find<Appointment>('appointments', {
      fixtureId: fixture.id,
      actorId: auth.actorId,
      status: 'accepted',
    }))
      if (row.role === 'principal' && (await appointmentValid(service.db, row, auth.actorId)))
        return true;
    return false;
  }
  return (
    auth.roles.includes('referee') &&
    !!match.refereeId &&
    !!auth.refereeIds?.includes(match.refereeId)
  );
}
export async function requireReportAccess(
  app: ApplicationContainer,
  auth: AuthContext,
  matchId: string,
) {
  if (!(await canReadReport(app, auth, matchId)))
    throw new PlatformError(
      403,
      'Referto riservato alla federazione competente e al suo arbitro principale.',
    );
}
