import type {
  GlobalOfficialPhoto,
  MatchSheetPhotoSnapshot,
  PhotoAccessGrant,
  PhotoApproval,
  PhotoSubject,
  PhotoVersion,
  SeasonRegistrationPhoto,
  UUID,
} from '../domain/index.js';
import type {
  GlobalOfficialPhotoRepository,
  MatchSheetPhotoSnapshotRepository,
  PhotoAccessGrantRepository,
  PhotoApprovalRepository,
  PhotoAuditEventRepository,
  PhotoSubjectRepository,
  PhotoVersionRepository,
  SeasonRegistrationPhotoRepository,
} from '../repositories/index.js';
import {
  assertPhotoApprovalTransition,
  assertPhotoVersionTransition,
} from './photo-state-machine.js';

export class PhotoInvariantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoInvariantViolationError';
  }
}

export class PhotoAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoAuthorizationError';
  }
}

export interface PhotoServiceDependencies {
  readonly photoSubjects: PhotoSubjectRepository;
  readonly globalOfficialPhotos: GlobalOfficialPhotoRepository;
  readonly seasonRegistrationPhotos: SeasonRegistrationPhotoRepository;
  readonly photoVersions: PhotoVersionRepository;
  readonly photoApprovals: PhotoApprovalRepository;
  readonly matchSheetPhotoSnapshots: MatchSheetPhotoSnapshotRepository;
  readonly photoAccessGrants: PhotoAccessGrantRepository;
  readonly photoAuditEvents: PhotoAuditEventRepository;
}

export interface PhotoAccessContext {
  readonly actorRole: 'manager' | 'federation' | 'referee' | 'admin';
  readonly actorId: UUID;
  readonly clubId?: UUID;
  readonly federationId?: UUID;
  readonly matchId?: UUID;
  readonly registrationClubId?: UUID;
  readonly authorizedMatchIds?: readonly UUID[];
  readonly grant?: PhotoAccessGrant;
}

export class PhotoService {
  constructor(private readonly dependencies: PhotoServiceDependencies) {}

  async transitionPhotoVersion(
    versionId: UUID,
    toStatus: PhotoVersion['status'],
  ): Promise<PhotoVersion> {
    const version = await this.requirePhotoVersion(versionId);
    assertPhotoVersionTransition(version.status, toStatus);
    return this.dependencies.photoVersions.update(version.id, {
      status: toStatus,
      activatedAt: toStatus === 'active' ? new Date().toISOString() : version.activatedAt,
      supersededAt: toStatus === 'superseded' ? new Date().toISOString() : version.supersededAt,
      archivedAt: toStatus === 'archived' ? new Date().toISOString() : version.archivedAt,
    });
  }

  async transitionPhotoApproval(
    approvalId: UUID,
    toStatus: PhotoApproval['status'],
  ): Promise<PhotoApproval> {
    const approval = await this.requirePhotoApproval(approvalId);
    assertPhotoApprovalTransition(approval.status, toStatus);
    return this.dependencies.photoApprovals.update(approval.id, {
      status: toStatus,
      decidedAt: ['approved', 'rejected'].includes(toStatus)
        ? new Date().toISOString()
        : approval.decidedAt,
    });
  }

  async createGlobalOfficialPhoto(
    input: Omit<GlobalOfficialPhoto, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<GlobalOfficialPhoto> {
    const existing = await this.dependencies.globalOfficialPhotos.findBySubject(
      input.photoSubjectId,
    );
    if (existing !== null) {
      throw new PhotoInvariantViolationError(
        'Only one global official photo row is allowed per subject.',
      );
    }
    return this.dependencies.globalOfficialPhotos.create(input);
  }

  async createPhotoVersion(
    input: Omit<PhotoVersion, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<PhotoVersion> {
    if (input.status === 'active') {
      const active = await this.dependencies.photoVersions.listActiveByGlobalPhoto(
        input.globalOfficialPhotoId,
      );
      if (active.length > 0) {
        throw new PhotoInvariantViolationError(
          'Only one active photo version is allowed per global photo.',
        );
      }
    }
    return this.dependencies.photoVersions.create(input);
  }

  async createSeasonRegistrationPhoto(
    input: Omit<SeasonRegistrationPhoto, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<SeasonRegistrationPhoto> {
    const existing = await this.dependencies.seasonRegistrationPhotos.findByRegistrationSeason(
      input.registrationId,
      input.seasonId,
    );
    if (existing !== null) {
      throw new PhotoInvariantViolationError(
        'Only one season registration photo is allowed per registration and season.',
      );
    }
    return this.dependencies.seasonRegistrationPhotos.create(input);
  }

  async createPendingApproval(
    input: Omit<PhotoApproval, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<PhotoApproval> {
    if (input.status === 'pending' && input.registrationId !== null) {
      const pending = await this.dependencies.photoApprovals.listPendingForRegistration(
        input.registrationId,
        input.seasonId,
      );
      if (pending.length > 0) {
        throw new PhotoInvariantViolationError(
          'Only one pending photo approval is allowed per registration and season.',
        );
      }
    }
    return this.dependencies.photoApprovals.create(input);
  }

  async createMatchSheetPhotoSnapshot(
    input: Omit<MatchSheetPhotoSnapshot, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<MatchSheetPhotoSnapshot> {
    const existing = await this.dependencies.matchSheetPhotoSnapshots.listByMatchSheet(
      input.matchSheetId,
    );
    if (existing.some((snapshot) => snapshot.registrationId === input.registrationId)) {
      throw new PhotoInvariantViolationError(
        'Match sheet photo snapshots are immutable per match sheet registration.',
      );
    }
    return this.dependencies.matchSheetPhotoSnapshots.create(input);
  }

  async assertCanAccessSeasonRegistrationPhoto(
    context: PhotoAccessContext,
    photo: SeasonRegistrationPhoto,
  ): Promise<void> {
    if (context.actorRole === 'admin') return;
    if (
      context.grant !== undefined &&
      context.grant.revokedAt === null &&
      context.grant.expiresAt > new Date().toISOString()
    )
      return;
    if (context.actorRole === 'federation' && context.federationId === photo.federationId) return;
    if (
      context.actorRole === 'manager' &&
      context.clubId !== undefined &&
      context.clubId === context.registrationClubId
    )
      return;
    if (
      context.actorRole === 'referee' &&
      context.matchId !== undefined &&
      context.authorizedMatchIds?.includes(context.matchId)
    )
      return;
    await this.dependencies.photoAuditEvents.create({
      correlationId: '00000000-0000-4000-8000-000000000001',
      actorUserId: context.actorId,
      actorRole: context.actorRole,
      federationId: context.federationId ?? null,
      seasonId: photo.seasonId,
      registrationId: photo.registrationId,
      photoSubjectId: photo.photoSubjectId,
      photoVersionId: photo.effectiveVersionId,
      eventType: 'photo.access_denied',
      payload: { reason: 'scope_mismatch' },
      ipHash: null,
      userAgentHash: null,
    });
    throw new PhotoAuthorizationError(
      'Photo access is outside the authorized seasonal registration scope.',
    );
  }

  async listPhotoSubjects(): Promise<readonly PhotoSubject[]> {
    return this.dependencies.photoSubjects.list();
  }

  async listApprovalsByFederation(federationId: UUID): Promise<readonly PhotoApproval[]> {
    return this.dependencies.photoApprovals.listByFederation(federationId);
  }

  private async requirePhotoVersion(versionId: UUID): Promise<PhotoVersion> {
    const version = await this.dependencies.photoVersions.findById(versionId);
    if (version === null)
      throw new PhotoInvariantViolationError(`Photo version ${versionId} was not found.`);
    return version;
  }

  private async requirePhotoApproval(approvalId: UUID): Promise<PhotoApproval> {
    const approval = await this.dependencies.photoApprovals.findById(approvalId);
    if (approval === null)
      throw new PhotoInvariantViolationError(`Photo approval ${approvalId} was not found.`);
    return approval;
  }
}
