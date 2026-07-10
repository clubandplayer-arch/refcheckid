import type {
  GlobalOfficialPhoto,
  MatchSheetPhotoSnapshot,
  Photo,
  PhotoAccessGrant,
  PhotoApproval,
  PhotoAuditEvent,
  PhotoSubject,
  PhotoSyncCursor,
  PhotoVersion,
  SeasonRegistrationPhoto,
  UUID,
} from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export class PhotoRepository extends DrizzleRepository<Photo> {
  constructor(initialRows: readonly Photo[] = []) {
    super({ tableName: 'photos', initialRows });
  }

  listByMatch(matchId: UUID): Promise<readonly Photo[]> {
    return Promise.resolve(this.values().filter((photo) => photo.matchId === matchId));
  }
}

export class PhotosRepository extends PhotoRepository {}

export class PhotoSubjectRepository extends DrizzleRepository<PhotoSubject> {
  constructor(initialRows: readonly PhotoSubject[] = []) {
    super({ tableName: 'photo_subjects', initialRows });
  }

  findByDedupeKeyHash(dedupeKeyHash: string): Promise<PhotoSubject | null> {
    return Promise.resolve(
      this.values().find(
        (subject) => subject.dedupeKeyHash === dedupeKeyHash && subject.deletedAt === null,
      ) ?? null,
    );
  }
}

export class GlobalOfficialPhotoRepository extends DrizzleRepository<GlobalOfficialPhoto> {
  constructor(initialRows: readonly GlobalOfficialPhoto[] = []) {
    super({ tableName: 'global_official_photos', initialRows });
  }

  findBySubject(photoSubjectId: UUID): Promise<GlobalOfficialPhoto | null> {
    return Promise.resolve(
      this.values().find(
        (photo) => photo.photoSubjectId === photoSubjectId && photo.deletedAt === null,
      ) ?? null,
    );
  }

  listActiveBySubject(photoSubjectId: UUID): Promise<readonly GlobalOfficialPhoto[]> {
    return Promise.resolve(
      this.values().filter(
        (photo) =>
          photo.photoSubjectId === photoSubjectId &&
          photo.status === 'active' &&
          photo.deletedAt === null,
      ),
    );
  }
}

export class SeasonRegistrationPhotoRepository extends DrizzleRepository<SeasonRegistrationPhoto> {
  constructor(initialRows: readonly SeasonRegistrationPhoto[] = []) {
    super({ tableName: 'season_registration_photos', initialRows });
  }

  findByRegistrationSeason(
    registrationId: UUID,
    seasonId: string,
  ): Promise<SeasonRegistrationPhoto | null> {
    return Promise.resolve(
      this.values().find(
        (photo) =>
          photo.registrationId === registrationId &&
          photo.seasonId === seasonId &&
          photo.deletedAt === null,
      ) ?? null,
    );
  }

  listByFederation(federationId: UUID): Promise<readonly SeasonRegistrationPhoto[]> {
    return Promise.resolve(
      this.values().filter(
        (photo) => photo.federationId === federationId && photo.deletedAt === null,
      ),
    );
  }

  listByVersion(photoVersionId: UUID): Promise<readonly SeasonRegistrationPhoto[]> {
    return Promise.resolve(
      this.values().filter(
        (photo) => photo.effectiveVersionId === photoVersionId && photo.deletedAt === null,
      ),
    );
  }
}

export class PhotoVersionRepository extends DrizzleRepository<PhotoVersion> {
  constructor(initialRows: readonly PhotoVersion[] = []) {
    super({ tableName: 'photo_versions', initialRows });
  }

  listByGlobalPhoto(globalOfficialPhotoId: UUID): Promise<readonly PhotoVersion[]> {
    return Promise.resolve(
      this.values().filter(
        (version) =>
          version.globalOfficialPhotoId === globalOfficialPhotoId && version.deletedAt === null,
      ),
    );
  }

  listActiveByGlobalPhoto(globalOfficialPhotoId: UUID): Promise<readonly PhotoVersion[]> {
    return Promise.resolve(
      this.values().filter(
        (version) =>
          version.globalOfficialPhotoId === globalOfficialPhotoId &&
          version.status === 'active' &&
          version.deletedAt === null,
      ),
    );
  }
}

export class PhotoApprovalRepository extends DrizzleRepository<PhotoApproval> {
  constructor(initialRows: readonly PhotoApproval[] = []) {
    super({ tableName: 'photo_approvals', initialRows });
  }

  listPendingForRegistration(
    registrationId: UUID,
    seasonId: string,
  ): Promise<readonly PhotoApproval[]> {
    return Promise.resolve(
      this.values().filter(
        (approval) =>
          approval.registrationId === registrationId &&
          approval.seasonId === seasonId &&
          approval.status === 'pending' &&
          approval.deletedAt === null,
      ),
    );
  }

  listByFederation(federationId: UUID): Promise<readonly PhotoApproval[]> {
    return Promise.resolve(
      this.values().filter(
        (approval) => approval.federationId === federationId && approval.deletedAt === null,
      ),
    );
  }
}

export class MatchSheetPhotoSnapshotRepository extends DrizzleRepository<MatchSheetPhotoSnapshot> {
  constructor(initialRows: readonly MatchSheetPhotoSnapshot[] = []) {
    super({ tableName: 'match_sheet_photo_snapshots', initialRows });
  }

  listByMatchSheet(matchSheetId: UUID): Promise<readonly MatchSheetPhotoSnapshot[]> {
    return Promise.resolve(
      this.values().filter(
        (snapshot) => snapshot.matchSheetId === matchSheetId && snapshot.deletedAt === null,
      ),
    );
  }
}

export class PhotoAccessGrantRepository extends DrizzleRepository<PhotoAccessGrant> {
  constructor(initialRows: readonly PhotoAccessGrant[] = []) {
    super({ tableName: 'photo_access_grants', initialRows });
  }

  listActiveByVersion(photoVersionId: UUID, now: string): Promise<readonly PhotoAccessGrant[]> {
    return Promise.resolve(
      this.values().filter(
        (grant) =>
          grant.photoVersionId === photoVersionId &&
          grant.revokedAt === null &&
          grant.expiresAt > now &&
          grant.deletedAt === null,
      ),
    );
  }
}

export class PhotoAuditEventRepository extends DrizzleRepository<PhotoAuditEvent> {
  constructor(initialRows: readonly PhotoAuditEvent[] = []) {
    super({ tableName: 'photo_audit_events', initialRows });
  }

  listByVersion(photoVersionId: UUID): Promise<readonly PhotoAuditEvent[]> {
    return Promise.resolve(
      this.values().filter(
        (event) => event.photoVersionId === photoVersionId && event.deletedAt === null,
      ),
    );
  }
}

export class PhotoSyncCursorRepository extends DrizzleRepository<PhotoSyncCursor> {
  constructor(initialRows: readonly PhotoSyncCursor[] = []) {
    super({ tableName: 'photo_sync_cursors', initialRows });
  }
}
