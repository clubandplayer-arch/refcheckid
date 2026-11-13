import type { ApplicationContainer } from '../config/application-container.js';
import type { ApiRequest } from './http.js';
import { json } from './http.js';
import { PlatformError } from '../platform/organizations.js';
import { requiresAnnualPhotoReason } from '../services/photo-change-policy.js';
import { signedPhotoContentUrl } from './photo-content-token.js';
import type {
  PhotoSubject,
  GlobalOfficialPhoto,
  PhotoVersion,
  PhotoApproval,
  SeasonRegistrationPhoto,
} from '../domain/index.js';
/** Two bounded metadata calls (players/staff) replace one command request per athlete. */
export async function managerPhotoRoster(app: ApplicationContainer, request: ApiRequest) {
  const clubId = request.params.id!;
  if (!request.auth?.roles.includes('manager') || !request.auth.clubIds?.includes(clubId))
    throw new PlatformError(403, 'Società fuori competenza.');
  const ids = [...new Set((request.query.registrations ?? '').split(',').filter(Boolean))];
  if (
    ids.length > 100 ||
    ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  )
    throw new PlatformError(400, 'Tesseramenti non validi (massimo 100).');
  await app.store.prefetch?.(
    ids.flatMap((id) => [
      { repository: 'player_registrations', id },
      { repository: 'staff_registrations', id },
    ]),
  );
  const registrations = [];
  for (const id of ids) {
    const player = await app.repositories.registrations.findById(id),
      staff = player ? null : await app.repositories.registrations.findStaffRegistrationById(id),
      registration = player ?? staff;
    if (!registration || registration.clubId !== clubId)
      throw new PlatformError(403, 'Tesseramento fuori competenza.');
    registrations.push({
      id,
      subjectId: player?.playerId ?? staff!.staffMemberId,
      kind: player ? 'athlete' : 'staff_member',
    });
  }
  async function many<T>(repository: string, key: string, values: string[]): Promise<readonly T[]> {
    if (!values.length) return [];
    return app.store.findMany
      ? app.store.findMany<T>(repository, key, values)
      : (await app.store.list<T>(repository)).filter((row) =>
          values.includes(String((row as Record<string, unknown>)[key])),
        );
  }
  const subjects = await many<PhotoSubject>(
    'photo_subjects',
    'dedupeKeyHash',
    registrations.map((r) => `${r.kind}:${r.subjectId}`),
  );
  const globals = await many<GlobalOfficialPhoto>(
    'global_official_photos',
    'photoSubjectId',
    subjects.map((s) => s.id),
  );
  const versions = await many<PhotoVersion>(
    'photo_versions',
    'globalOfficialPhotoId',
    globals.map((g) => g.id),
  );
  const approvals = await many<PhotoApproval>('photo_approvals', 'registrationId', ids);
  const seasonPhotos = await many<SeasonRegistrationPhoto>(
    'season_registration_photos',
    'registrationId',
    ids,
  );
  const items = registrations.map((reg) => {
    const subject = subjects.find((s) => s.dedupeKeyHash === `${reg.kind}:${reg.subjectId}`),
      global = globals.find((g) => g.photoSubjectId === subject?.id),
      history = versions.filter((v) => v.globalOfficialPhotoId === global?.id),
      photo = seasonPhotos.find((p) => p.registrationId === reg.id && p.deletedAt === null);
    const pending = approvals
      .filter((a) => a.registrationId === reg.id && a.status === 'pending' && a.deletedAt === null)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
    return {
      registrationId: reg.id,
      status: pending
        ? 'pending'
        : photo?.status === 'valid'
          ? 'active'
          : photo?.status === 'pending'
            ? 'pending'
            : photo
              ? 'suspended'
              : 'missing',
      approvalId: pending?.id ?? null,
      currentPhotoUrl: photo ? signedPhotoContentUrl(photo.effectiveVersionId, 'thumb_320') : null,
      proposedPhotoUrl: pending ? signedPhotoContentUrl(pending.photoVersionId, 'thumb_320') : null,
      requiresReplacementReason: !!global?.currentVersionId && requiresAnnualPhotoReason(history),
    };
  });
  return json(200, { items });
}
