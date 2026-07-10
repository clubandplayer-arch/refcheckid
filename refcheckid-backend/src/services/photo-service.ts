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
import type { PhotoObjectStore } from './photo-object-store.js';
import { PhotoPolicyEngine } from './photo-policy-engine.js';
import { PhotoValidationPipeline } from './photo-validation-pipeline.js';

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
  readonly objectStore?: PhotoObjectStore;
  readonly policyEngine?: PhotoPolicyEngine;
  readonly validationPipeline?: PhotoValidationPipeline;
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

export interface CreateUploadIntentCommand {
  readonly playerId: UUID;
  readonly registrationId: UUID;
  readonly federationId: UUID;
  readonly seasonId: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly sha256: string;
  readonly context: PhotoAccessContext;
}
export interface CompleteUploadCommand {
  readonly uploadId: UUID;
  readonly objectKey: string;
  readonly contentBase64?: string;
  readonly context: PhotoAccessContext;
}

export interface PhotoDecisionCommand {
  readonly approvalId: UUID;
  readonly context: PhotoAccessContext;
  readonly reasonCode?: string | undefined;
  readonly notes?: string | undefined;
}

export class PhotoService {
  private readonly policyEngine: PhotoPolicyEngine;
  private readonly validationPipeline: PhotoValidationPipeline;
  private readonly uploadSessions = new Map<
    UUID,
    CreateUploadIntentCommand & { photoSubjectId: UUID; globalOfficialPhotoId: UUID }
  >();

  constructor(private readonly dependencies: PhotoServiceDependencies) {
    this.policyEngine = dependencies.policyEngine ?? new PhotoPolicyEngine();
    this.validationPipeline = dependencies.validationPipeline ?? new PhotoValidationPipeline();
  }

  async createUploadIntent(command: CreateUploadIntentCommand) {
    const player = await this.dependencies.photoSubjects.create({
      subjectKind: 'athlete',
      canonicalPersonId: command.playerId,
      dedupeKeyHash: command.playerId,
    });
    const global =
      (await this.dependencies.globalOfficialPhotos.findBySubject(player.id)) ??
      (await this.dependencies.globalOfficialPhotos.create({
        photoSubjectId: player.id,
        currentVersionId: null,
        status: 'pending_first_approval',
        lastApprovedAt: null,
        lastChangedAt: new Date().toISOString(),
      }));
    const extension =
      command.mimeType === 'image/png'
        ? '.png'
        : command.mimeType === 'image/webp'
          ? '.webp'
          : '.jpg';
    const objectKey = `subjects/${player.id}/uploads/${crypto.randomUUID()}/original${extension}`;
    if (
      !this.policyEngine.canUpload(
        command.context,
        command.context.registrationClubId ?? command.context.clubId ?? '',
        command.federationId,
      )
    )
      throw new PhotoAuthorizationError('Actor cannot upload a photo for this registration.');
    if (this.dependencies.objectStore === undefined)
      throw new PhotoInvariantViolationError('Photo object store is not configured.');
    const intent = await this.dependencies.objectStore.createUploadIntent({
      objectKey,
      mimeType: command.mimeType,
      fileSizeBytes: command.fileSizeBytes,
      sha256: command.sha256,
    });
    this.uploadSessions.set(intent.uploadId, {
      ...command,
      photoSubjectId: player.id,
      globalOfficialPhotoId: global.id,
    });
    await this.dependencies.photoAuditEvents.create({
      correlationId: intent.uploadId,
      actorUserId: command.context.actorId,
      actorRole: command.context.actorRole,
      federationId: command.federationId,
      seasonId: command.seasonId,
      registrationId: command.registrationId,
      photoSubjectId: player.id,
      photoVersionId: null,
      eventType: 'photo.upload_intent_created',
      payload: { objectKey, globalOfficialPhotoId: global.id },
      ipHash: null,
      userAgentHash: null,
    });
    return { ...intent, photoSubjectId: player.id, globalOfficialPhotoId: global.id };
  }

  async completeUpload(command: CompleteUploadCommand) {
    if (this.dependencies.objectStore === undefined)
      throw new PhotoInvariantViolationError('Photo object store is not configured.');
    if (command.contentBase64 !== undefined && this.dependencies.objectStore.putObject)
      await this.dependencies.objectStore.putObject(
        command.objectKey,
        Buffer.from(command.contentBase64, 'base64'),
      );
    const uploaded = await this.dependencies.objectStore.confirmUploadedObject(command.objectKey);
    const bytes = uploaded.bytes;
    if (bytes === undefined)
      throw new PhotoInvariantViolationError('Object store did not return bytes for validation.');
    const intentMime = command.objectKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const validated = this.validationPipeline.validate({ bytes, declaredMimeType: intentMime });
    const subjectId = command.objectKey.split('/')[1];
    const global = await this.dependencies.globalOfficialPhotos.findBySubject(subjectId);
    if (global === null)
      throw new PhotoInvariantViolationError('Global official photo was not found for upload.');
    const existing = await this.dependencies.photoVersions.listByGlobalPhoto(global.id);
    const version = await this.dependencies.photoVersions.create({
      globalOfficialPhotoId: global.id,
      versionNumber: existing.length + 1,
      uploadedByUserId: command.context.actorId,
      uploadedByRole: command.context.actorRole,
      uploadedByClubId: command.context.clubId ?? null,
      originFederationId: command.context.federationId ?? null,
      originSeasonId: this.uploadSessions.get(command.uploadId)?.seasonId ?? null,
      storageOriginalKey: command.objectKey,
      storageNormalizedKey: `${command.objectKey}.normalized`,
      mimeType: validated.mimeType,
      normalizedMimeType: validated.normalizedMimeType,
      fileSizeBytes: validated.fileSizeBytes,
      width: validated.width,
      height: validated.height,
      sha256: validated.sha256,
      perceptualHash: validated.perceptualHash,
      exifStripped: validated.exifStripped,
      avScanStatus: validated.avScanStatus,
      validationStatus: 'valid',
      status: 'pending_approval',
      activatedAt: null,
      supersededAt: null,
      archivedAt: null,
      rejectionReasonCode: null,
      rejectionNotes: null,
    });
    const session = this.uploadSessions.get(command.uploadId);
    if (session !== undefined) {
      await this.dependencies.photoApprovals.create({
        photoVersionId: version.id,
        federationId: session.federationId,
        disciplineId: null,
        seasonId: session.seasonId,
        registrationId: session.registrationId,
        requestedByUserId: session.context.actorId,
        requestedAt: new Date().toISOString(),
        decidedByUserId: null,
        decidedAt: null,
        status: 'pending',
        decisionReasonCode: null,
        decisionNotes: null,
        scope: 'single_registration',
        slaDueAt: null,
      });
    }
    await this.dependencies.objectStore.registerRendition({
      sourceObjectKey: command.objectKey,
      renditionObjectKey: `${command.objectKey}.normalized`,
      rendition: 'normalized',
      mimeType: validated.normalizedMimeType,
      width: validated.width,
      height: validated.height,
      bytes: validated.normalized,
    });
    await this.dependencies.photoAuditEvents.create({
      correlationId: command.uploadId,
      actorUserId: command.context.actorId,
      actorRole: command.context.actorRole,
      federationId: command.context.federationId ?? null,
      seasonId: null,
      registrationId: null,
      photoSubjectId: subjectId,
      photoVersionId: version.id,
      eventType: 'photo.validation_passed',
      payload: { sha256: validated.sha256, perceptualHash: validated.perceptualHash },
      ipHash: null,
      userAgentHash: null,
    });
    return version;
  }

  async createSignedReadUrl(
    versionId: UUID,
    context: PhotoAccessContext,
    requested: {
      rendition?: 'original' | 'normalized' | 'thumb_128' | 'thumb_320';
      ttlSeconds?: number;
      disposition?: 'inline' | 'attachment';
    } = {},
  ) {
    const version = await this.requirePhotoVersion(versionId);
    const registrations = await this.dependencies.seasonRegistrationPhotos.listByVersion(
      version.id,
    );
    const policy = registrations[0]
      ? this.policyEngine.readPolicy(context, registrations[0], requested)
      : {
          rendition: requested.rendition ?? 'normalized',
          ttlSeconds: Math.min(requested.ttlSeconds ?? 300, 900),
          disposition: requested.disposition ?? 'inline',
        };
    if (this.dependencies.objectStore === undefined)
      throw new PhotoInvariantViolationError('Photo object store is not configured.');
    const objectKey =
      policy.rendition === 'original'
        ? version.storageOriginalKey
        : (version.storageNormalizedKey ?? version.storageOriginalKey);
    const signed = await this.dependencies.objectStore.createSignedReadUrl({
      objectKey,
      rendition: policy.rendition,
      ttlSeconds: policy.ttlSeconds,
      disposition: policy.disposition,
      correlationId: crypto.randomUUID(),
    });
    await this.dependencies.photoAuditEvents.create({
      correlationId: crypto.randomUUID(),
      actorUserId: context.actorId,
      actorRole: context.actorRole,
      federationId: context.federationId ?? null,
      seasonId: registrations[0]?.seasonId ?? null,
      registrationId: registrations[0]?.registrationId ?? null,
      photoSubjectId: null,
      photoVersionId: version.id,
      eventType: 'photo.signed_url_issued',
      payload: { rendition: policy.rendition, ttlSeconds: policy.ttlSeconds },
      ipHash: null,
      userAgentHash: null,
    });
    return { version, signedUrl: signed, rendition: policy.rendition };
  }

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

  async approvePhotoApproval(command: PhotoDecisionCommand): Promise<PhotoApproval> {
    const approval = await this.requirePhotoApproval(command.approvalId);
    this.assertCanDecideApproval(command.context, approval);
    if (approval.status === 'approved') return approval;
    if (approval.status !== 'pending') {
      assertPhotoApprovalTransition(approval.status, 'approved');
    }
    const version = await this.requirePhotoVersion(approval.photoVersionId);
    const global = await this.requireGlobalOfficialPhoto(version.globalOfficialPhotoId);
    const now = new Date().toISOString();

    const decided = await this.dependencies.photoApprovals.update(approval.id, {
      status: 'approved',
      decidedByUserId: command.context.actorId,
      decidedAt: now,
      decisionReasonCode: command.reasonCode ?? approval.decisionReasonCode ?? 'approved',
      decisionNotes: command.notes ?? approval.decisionNotes,
    });

    if (version.status !== 'active') {
      assertPhotoVersionTransition(version.status, 'active');
      await this.dependencies.photoVersions.update(version.id, {
        status: 'active',
        activatedAt: now,
      });
    }
    for (const active of await this.dependencies.photoVersions.listActiveByGlobalPhoto(global.id)) {
      if (active.id !== version.id) {
        await this.dependencies.photoVersions.update(active.id, {
          status: 'superseded',
          supersededAt: now,
        });
        await this.dependencies.photoAuditEvents.create({
          correlationId: approval.id,
          actorUserId: command.context.actorId,
          actorRole: command.context.actorRole,
          federationId: approval.federationId,
          seasonId: approval.seasonId,
          registrationId: approval.registrationId,
          photoSubjectId: global.photoSubjectId,
          photoVersionId: active.id,
          eventType: 'photo.superseded',
          payload: { replacementVersionId: version.id },
          ipHash: null,
          userAgentHash: null,
        });
      }
    }
    await this.dependencies.globalOfficialPhotos.update(global.id, {
      currentVersionId: version.id,
      status: 'active',
      lastApprovedAt: now,
      lastChangedAt: now,
    });
    if (approval.registrationId !== null) {
      const existing = await this.dependencies.seasonRegistrationPhotos.findByRegistrationSeason(
        approval.registrationId,
        approval.seasonId,
      );
      if (existing === null) {
        await this.dependencies.seasonRegistrationPhotos.create({
          federationId: approval.federationId,
          disciplineId: approval.disciplineId,
          seasonId: approval.seasonId,
          registrationId: approval.registrationId,
          photoSubjectId: global.photoSubjectId,
          globalOfficialPhotoId: global.id,
          effectiveVersionId: version.id,
          approvalId: approval.id,
          status: 'valid',
          validFrom: now,
          validUntil: null,
        });
      } else {
        await this.dependencies.seasonRegistrationPhotos.update(existing.id, {
          effectiveVersionId: version.id,
          approvalId: approval.id,
          status: 'valid',
        });
      }
    }
    await this.dependencies.photoAuditEvents.create({
      correlationId: approval.id,
      actorUserId: command.context.actorId,
      actorRole: command.context.actorRole,
      federationId: approval.federationId,
      seasonId: approval.seasonId,
      registrationId: approval.registrationId,
      photoSubjectId: global.photoSubjectId,
      photoVersionId: version.id,
      eventType: 'photo.approved',
      payload: { reasonCode: decided.decisionReasonCode, notes: decided.decisionNotes },
      ipHash: null,
      userAgentHash: null,
    });
    return decided;
  }

  async rejectPhotoApproval(command: PhotoDecisionCommand): Promise<PhotoApproval> {
    const approval = await this.requirePhotoApproval(command.approvalId);
    this.assertCanDecideApproval(command.context, approval);
    if (approval.status === 'rejected') return approval;
    if (approval.status !== 'pending') {
      assertPhotoApprovalTransition(approval.status, 'rejected');
    }
    const version = await this.requirePhotoVersion(approval.photoVersionId);
    const global = await this.requireGlobalOfficialPhoto(version.globalOfficialPhotoId);
    const now = new Date().toISOString();
    const decided = await this.dependencies.photoApprovals.update(approval.id, {
      status: 'rejected',
      decidedByUserId: command.context.actorId,
      decidedAt: now,
      decisionReasonCode: command.reasonCode ?? 'rejected',
      decisionNotes: command.notes ?? null,
    });
    if (version.status !== 'rejected') {
      assertPhotoVersionTransition(version.status, 'rejected');
      await this.dependencies.photoVersions.update(version.id, {
        status: 'rejected',
        rejectionReasonCode: decided.decisionReasonCode,
        rejectionNotes: decided.decisionNotes,
      });
    }
    await this.dependencies.photoAuditEvents.create({
      correlationId: approval.id,
      actorUserId: command.context.actorId,
      actorRole: command.context.actorRole,
      federationId: approval.federationId,
      seasonId: approval.seasonId,
      registrationId: approval.registrationId,
      photoSubjectId: global.photoSubjectId,
      photoVersionId: version.id,
      eventType: 'photo.rejected',
      payload: { reasonCode: decided.decisionReasonCode, notes: decided.decisionNotes },
      ipHash: null,
      userAgentHash: null,
    });
    return decided;
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

  private assertCanDecideApproval(context: PhotoAccessContext, approval: PhotoApproval): void {
    if (context.actorRole === 'admin') return;
    if (context.actorRole === 'federation' && context.federationId === approval.federationId)
      return;
    throw new PhotoAuthorizationError('Actor cannot decide photo approvals for this federation.');
  }

  private async requireGlobalOfficialPhoto(
    globalOfficialPhotoId: UUID,
  ): Promise<GlobalOfficialPhoto> {
    const global = await this.dependencies.globalOfficialPhotos.findById(globalOfficialPhotoId);
    if (global === null)
      throw new PhotoInvariantViolationError(
        `Global official photo ${globalOfficialPhotoId} was not found.`,
      );
    return global;
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
