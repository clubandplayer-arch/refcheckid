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
      context.federationId === photo.federationId ||
      context.clubId === context.registrationClubId ||
      context.grant
    ) {
      return {
        rendition: requested?.rendition ?? 'normalized',
        ttlSeconds: Math.min(requested?.ttlSeconds ?? 300, 900),
        disposition: requested?.disposition ?? 'inline',
      };
    }
    throw new Error('Photo access denied by policy.');
  }
}
