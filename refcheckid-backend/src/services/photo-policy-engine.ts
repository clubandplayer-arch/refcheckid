import type { SeasonRegistrationPhoto, UUID } from '../domain/index.js';
import type { PhotoAccessContext } from './photo-service.js';

export interface PhotoReadPolicy {
  readonly rendition: 'original' | 'normalized' | 'thumb_128' | 'thumb_320';
  readonly ttlSeconds: number;
  readonly disposition: 'inline' | 'attachment';
}

export class PhotoPolicyEngine {
  canUpload(context: PhotoAccessContext, registrationClubId: UUID, federationId: UUID): boolean {
    if (context.actorRole === 'admin') return true;
    if (context.actorRole === 'federation') return context.federationId === federationId;
    return context.actorRole === 'manager' && context.clubId === registrationClubId;
  }

  readPolicy(
    context: PhotoAccessContext,
    photo: SeasonRegistrationPhoto,
    requested?: Partial<PhotoReadPolicy>,
  ): PhotoReadPolicy {
    if (
      context.actorRole === 'admin' ||
      (context.actorRole === 'federation' && (context.federationId === photo.federationId || context.federationIds?.includes(photo.federationId))) ||
      (context.actorRole === 'manager' && context.clubId !== undefined && context.clubId === context.registrationClubId) ||
      (context.actorRole === 'referee' &&
        context.matchId !== undefined &&
        context.authorizedMatchIds?.includes(context.matchId)) ||
      (context.grant && context.grant.revokedAt === null && context.grant.expiresAt > new Date().toISOString() && context.grant.photoVersionId === photo.effectiveVersionId)
    ) {
      return {
        rendition: requested?.rendition ?? 'normalized',
        ttlSeconds: Math.max(1, Math.min(requested?.ttlSeconds ?? 300, 900)),
        disposition: requested?.disposition ?? 'inline',
      };
    }
    throw new Error('Photo access denied by policy.');
  }
}
