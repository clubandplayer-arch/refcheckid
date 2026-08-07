import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

abstract class PersistentPhotoRepository<
  TEntity extends { id: UUID; createdAt: string },
> extends DrizzleRepository<TEntity> {
  private readonly persistencePath: string | null;

  protected constructor(
    tableName: string,
    fileName: string,
    initialRows: readonly TEntity[],
    persistenceRoot: string | null = resolvePhotoMetadataRoot(),
  ) {
    const persistencePath = persistenceRoot === null ? null : join(persistenceRoot, fileName);
    super({
      tableName,
      initialRows: persistencePath === null ? initialRows : loadRows(persistencePath, initialRows),
    });
    this.persistencePath = persistencePath;
  }

  override async create(input: Partial<TEntity>): Promise<TEntity> {
    const created = await super.create(input);
    this.persist();
    return created;
  }

  override async update(id: UUID, input: Partial<TEntity>): Promise<TEntity> {
    const updated = await super.update(id, input);
    this.persist();
    return updated;
  }

  override async upsert(entity: TEntity): Promise<TEntity> {
    const upserted = await super.upsert(entity);
    this.persist();
    return upserted;
  }

  private persist(): void {
    if (this.persistencePath === null) return;

    mkdirSync(dirname(this.persistencePath), { recursive: true });
    const temporaryPath = `${this.persistencePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(this.values(), null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, this.persistencePath);
  }
}

function loadRows<TEntity>(path: string, fallback: readonly TEntity[]): readonly TEntity[] {
  if (!existsSync(path)) return fallback;

  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`Photo metadata store ${path} must contain a JSON array.`);
  }
  return parsed as readonly TEntity[];
}

export function resolvePhotoMetadataRoot(): string | null {
  if (process.env.REFCHECKID_PHOTO_METADATA_ROOT !== undefined) {
    return process.env.REFCHECKID_PHOTO_METADATA_ROOT;
  }
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return null;
  return join(process.cwd(), 'storage', 'refcheckid-photo-metadata-dev');
}

export class PhotoRepository extends PersistentPhotoRepository<Photo> {
  constructor(initialRows: readonly Photo[] = [], persistenceRoot?: string | null) {
    super('photos', 'photos.json', initialRows, persistenceRoot);
  }

  listByMatch(matchId: UUID): Promise<readonly Photo[]> {
    return Promise.resolve(this.values().filter((photo) => photo.matchId === matchId));
  }
}

export class PhotosRepository extends PhotoRepository {}

export class PhotoSubjectRepository extends PersistentPhotoRepository<PhotoSubject> {
  constructor(initialRows: readonly PhotoSubject[] = [], persistenceRoot?: string | null) {
    super('photo_subjects', 'photo-subjects.json', initialRows, persistenceRoot);
  }

  findByDedupeKeyHash(dedupeKeyHash: string): Promise<PhotoSubject | null> {
    return Promise.resolve(
      this.values().find(
        (subject) => subject.dedupeKeyHash === dedupeKeyHash && subject.deletedAt === null,
      ) ?? null,
    );
  }
}

export class GlobalOfficialPhotoRepository extends PersistentPhotoRepository<GlobalOfficialPhoto> {
  constructor(initialRows: readonly GlobalOfficialPhoto[] = [], persistenceRoot?: string | null) {
    super('global_official_photos', 'global-official-photos.json', initialRows, persistenceRoot);
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

export class SeasonRegistrationPhotoRepository extends PersistentPhotoRepository<SeasonRegistrationPhoto> {
  constructor(
    initialRows: readonly SeasonRegistrationPhoto[] = [],
    persistenceRoot?: string | null,
  ) {
    super(
      'season_registration_photos',
      'season-registration-photos.json',
      initialRows,
      persistenceRoot,
    );
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

export class PhotoVersionRepository extends PersistentPhotoRepository<PhotoVersion> {
  constructor(initialRows: readonly PhotoVersion[] = [], persistenceRoot?: string | null) {
    super('photo_versions', 'photo-versions.json', initialRows, persistenceRoot);
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

export class PhotoApprovalRepository extends PersistentPhotoRepository<PhotoApproval> {
  constructor(initialRows: readonly PhotoApproval[] = [], persistenceRoot?: string | null) {
    super('photo_approvals', 'photo-approvals.json', initialRows, persistenceRoot);
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

  listPendingByRegistration(registrationId: UUID): Promise<readonly PhotoApproval[]> {
    return Promise.resolve(
      this.values().filter(
        (approval) =>
          approval.registrationId === registrationId &&
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

export class MatchSheetPhotoSnapshotRepository extends PersistentPhotoRepository<MatchSheetPhotoSnapshot> {
  constructor(
    initialRows: readonly MatchSheetPhotoSnapshot[] = [],
    persistenceRoot?: string | null,
  ) {
    super(
      'match_sheet_photo_snapshots',
      'match-sheet-photo-snapshots.json',
      initialRows,
      persistenceRoot,
    );
  }

  listByMatchSheet(matchSheetId: UUID): Promise<readonly MatchSheetPhotoSnapshot[]> {
    return Promise.resolve(
      this.values().filter(
        (snapshot) => snapshot.matchSheetId === matchSheetId && snapshot.deletedAt === null,
      ),
    );
  }
}

export class PhotoAccessGrantRepository extends PersistentPhotoRepository<PhotoAccessGrant> {
  constructor(initialRows: readonly PhotoAccessGrant[] = [], persistenceRoot?: string | null) {
    super('photo_access_grants', 'photo-access-grants.json', initialRows, persistenceRoot);
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

export class PhotoAuditEventRepository extends PersistentPhotoRepository<PhotoAuditEvent> {
  constructor(initialRows: readonly PhotoAuditEvent[] = [], persistenceRoot?: string | null) {
    super('photo_audit_events', 'photo-audit-events.json', initialRows, persistenceRoot);
  }

  listByVersion(photoVersionId: UUID): Promise<readonly PhotoAuditEvent[]> {
    return Promise.resolve(
      this.values().filter(
        (event) => event.photoVersionId === photoVersionId && event.deletedAt === null,
      ),
    );
  }
}

export class PhotoSyncCursorRepository extends PersistentPhotoRepository<PhotoSyncCursor> {
  constructor(initialRows: readonly PhotoSyncCursor[] = [], persistenceRoot?: string | null) {
    super('photo_sync_cursors', 'photo-sync-cursors.json', initialRows, persistenceRoot);
  }
}
