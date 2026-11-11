import { reviewerScope } from '../platform/photo-scopes.js';
import type { ApplicationContainer } from '../config/application-container.js';
import type { ApiRequest } from './http.js';
import { json } from './http.js';
import { requireUuid, ValidationError } from './validation.js';
import type { PhotoApprovalPageQuery, PhotoApprovalPageResult, PhotoApprovalPageRow } from '../repositories/photo-approval-page.js';
import type { PhotoApproval } from '../domain/photo/types.js';
import { signedPhotoContentUrl } from './photo-content-token.js';

export const approvalPageSize = 12;
function cursorFrom(request: ApiRequest): { afterRequestedAt?: string; afterId?: string } {
  if (!request.query.cursor) return {};
  try {
    if (request.query.cursor.length > 512) throw new Error();
    const value = JSON.parse(Buffer.from(request.query.cursor, 'base64url').toString()) as { requestedAt: unknown; id: unknown };
    if (typeof value.requestedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.requestedAt) || !Number.isFinite(Date.parse(value.requestedAt)) || typeof value.id !== 'string') throw new Error();
    return { afterRequestedAt: value.requestedAt, afterId: requireUuid(value.id, 'cursor') };
  } catch { throw new ValidationError('Invalid photo queue cursor.', 'cursor'); }
}

/** Local SQLite compatibility. Cloud uses one bounded, scoped SQL query instead. */
async function localPage(app: ApplicationContainer, query: PhotoApprovalPageQuery): Promise<PhotoApprovalPageResult> {
  const approvals = (await app.store.list<PhotoApproval>('photo_approvals')).filter((a) => a.deletedAt === null &&
    (!query.federationFilter||a.federationId===query.federationFilter) && (query.federationIds === null || query.federationIds.includes(a.federationId) || !!query.clubIds?.length) && (!query.status || a.status === query.status));
  const rows: PhotoApprovalPageRow[] = [];
  for (const a of approvals) {
    const pr = a.registrationId ? await app.repositories.registrations.findById(a.registrationId) : null;
    const sr = !pr && a.registrationId ? await app.repositories.registrations.findStaffRegistrationById(a.registrationId) : null;
    const clubId = pr?.clubId ?? sr?.clubId ?? null;
    if(query.federationIds!==null&&!query.federationIds.includes(a.federationId)&&(!clubId||!query.clubIds?.includes(clubId)||(await app.repositories.clubs.findById(clubId))?.federationId!==a.federationId))continue;
    const slaStatus = a.status !== 'pending' ? 'closed' : !a.slaDueAt ? 'not_set' : a.slaDueAt < query.now ? 'overdue' : 'on_track';
    if ((query.clubId && query.clubId !== clubId) || (query.sla && query.sla !== slaStatus)) continue;
    rows.push({ ...a, clubId, clubName: null, subjectName: null, currentVersionId: null, proposedVersionId: a.photoVersionId, slaStatus });
  }
  rows.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id));
  const page = rows.filter((a) => !query.afterRequestedAt || a.requestedAt > query.afterRequestedAt || (a.requestedAt === query.afterRequestedAt && a.id > (query.afterId ?? ''))).slice(0, query.limit);
  for (const a of page) {
    const pr = a.registrationId ? await app.repositories.registrations.findById(a.registrationId) : null;
    const sr = !pr && a.registrationId ? await app.repositories.registrations.findStaffRegistrationById(a.registrationId) : null;
    const person = pr ? await app.repositories.players.findById(pr.playerId) : sr ? await app.repositories.registrations.findStaffMemberById(sr.staffMemberId) : null;
    a.subjectName = person ? `${person.firstName} ${person.lastName}`.trim() : null;
    a.clubName = a.clubId ? (await app.repositories.clubs.findById(a.clubId))?.name ?? null : null;
    const version = await app.repositories.photoVersions.findById(a.photoVersionId);
    const global = version ? await app.repositories.globalOfficialPhotos.findById(version.globalOfficialPhotoId) : null;
    a.currentVersionId = global?.currentVersionId === a.photoVersionId ? null : global?.currentVersionId ?? null;
  }
  return { total: rows.length, items: page };
}

export async function photoApprovalQueue(app: ApplicationContainer, request: ApiRequest, countOnly = false) {
  if(!request.auth)return json(401,{error:'UNAUTHENTICATED'});
  const {federationIds,clubIds}=await reviewerScope(app,request.auth);
  if (federationIds !== null && !federationIds.length && !clubIds.length) return json(403, { error: 'FORBIDDEN', message: 'Federation scope required.' });
  const status = countOnly ? 'pending' : request.query.status;
  if (status && !['pending', 'approved', 'rejected', 'cancelled', 'expired'].includes(status)) throw new ValidationError('Invalid approval status.', 'status');
  const sla = request.query.sla;
  if (sla && !['overdue', 'on_track', 'not_set', 'closed'].includes(sla)) throw new ValidationError('Invalid SLA filter.', 'sla');
  const query: PhotoApprovalPageQuery = { federationIds,clubIds,...(request.query.federationId?{federationFilter:requireUuid(request.query.federationId,'federationId')}:{}), limit: countOnly ? 0 : approvalPageSize + 1, now: new Date().toISOString(),
    ...(status ? { status } : {}), ...(sla ? { sla } : {}),
    ...(request.query.clubId ? { clubId: requireUuid(request.query.clubId, 'clubId') } : {}), ...cursorFrom(request) };
  const page = app.store.photoApprovalPage ? await app.store.photoApprovalPage(query) : await localPage(app, query);
  if (countOnly) return json(200, { pending: page.total });
  const items = page.items.slice(0, approvalPageSize).map((row) => ({ ...row,
    currentPhotoUrl: row.currentVersionId ? signedPhotoContentUrl(row.currentVersionId, 'thumb_320') : null,
    proposedPhotoUrl: signedPhotoContentUrl(row.photoVersionId, 'thumb_320'),
    currentFullPhotoUrl: row.currentVersionId ? signedPhotoContentUrl(row.currentVersionId) : null,
    proposedFullPhotoUrl: signedPhotoContentUrl(row.photoVersionId),
  }));
  const last = items.at(-1);
  return json(200, { items, total: page.total, nextCursor: page.items.length > approvalPageSize && last
    ? Buffer.from(JSON.stringify({ requestedAt: last.requestedAt, id: last.id })).toString('base64url') : null });
}
