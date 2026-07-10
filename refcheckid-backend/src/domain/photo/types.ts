import type { BaseEntity, ISODateTime, UUID } from '../shared/types.js';

export type PhotoStatus = 'active' | 'archived';
export type IdentityDocumentStatus = 'valid' | 'expired' | 'revoked';

export interface Photo extends BaseEntity {
  playerId: UUID | null;
  staffMemberId: UUID | null;
  refereeId: UUID | null;
  matchId: UUID | null;
  matchReportId: UUID | null;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  status: PhotoStatus;
}

export interface IdentityDocument extends BaseEntity {
  playerId: UUID | null;
  staffMemberId: UUID | null;
  refereeId: UUID | null;
  documentType: string;
  documentNumber: string;
  issuedAt: string | null;
  expiresAt: string | null;
  status: IdentityDocumentStatus;
}

export type PhotoSubjectKind = 'athlete' | 'staff_member' | 'referee';
export type GlobalOfficialPhotoStatus =
  'missing' | 'pending_first_approval' | 'active' | 'suspended' | 'retired';
export type SeasonRegistrationPhotoStatus =
  'pending' | 'valid' | 'suspended' | 'expired' | 'revoked';
export type PhotoVersionStatus =
  | 'uploaded'
  | 'validating'
  | 'pending_approval'
  | 'active'
  | 'rejected'
  | 'superseded'
  | 'archived'
  | 'quarantined'
  | 'erasure_pending'
  | 'erased';
export type PhotoApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type PhotoApprovalScope = 'single_registration' | 'federation_season' | 'global_reuse';
export type PhotoGrantType = 'user' | 'role' | 'club' | 'federation' | 'match_assignment';
export type PhotoAuditEventType =
  | 'photo.upload_intent_created'
  | 'photo.upload_completed'
  | 'photo.validation_started'
  | 'photo.validation_passed'
  | 'photo.validation_failed'
  | 'photo.approval_requested'
  | 'photo.approved'
  | 'photo.rejected'
  | 'photo.superseded'
  | 'photo.archived'
  | 'photo.quarantined'
  | 'photo.erasure_requested'
  | 'photo.erased'
  | 'photo.signed_url_issued'
  | 'photo.access_denied'
  | 'match_sheet.photo_snapshot_frozen';

export interface PhotoSubject extends BaseEntity {
  subjectKind: PhotoSubjectKind;
  canonicalPersonId: UUID | null;
  dedupeKeyHash: string | null;
}

export interface GlobalOfficialPhoto extends BaseEntity {
  photoSubjectId: UUID;
  currentVersionId: UUID | null;
  status: GlobalOfficialPhotoStatus;
  lastApprovedAt: ISODateTime | null;
  lastChangedAt: ISODateTime;
}

export interface SeasonRegistrationPhoto extends BaseEntity {
  federationId: UUID;
  disciplineId: UUID | null;
  seasonId: string;
  registrationId: UUID;
  photoSubjectId: UUID;
  globalOfficialPhotoId: UUID;
  effectiveVersionId: UUID;
  approvalId: UUID | null;
  status: SeasonRegistrationPhotoStatus;
  validFrom: ISODateTime;
  validUntil: ISODateTime | null;
}

export interface PhotoVersion extends BaseEntity {
  globalOfficialPhotoId: UUID;
  versionNumber: number;
  uploadedByUserId: UUID;
  uploadedByRole: string;
  uploadedByClubId: UUID | null;
  originFederationId: UUID | null;
  originSeasonId: string | null;
  storageOriginalKey: string;
  storageNormalizedKey: string | null;
  mimeType: string;
  normalizedMimeType: string | null;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  perceptualHash: string | null;
  exifStripped: boolean;
  avScanStatus: 'pending' | 'clean' | 'infected' | 'failed' | 'skipped';
  validationStatus: 'pending' | 'valid' | 'invalid';
  status: PhotoVersionStatus;
  activatedAt: ISODateTime | null;
  supersededAt: ISODateTime | null;
  archivedAt: ISODateTime | null;
  rejectionReasonCode: string | null;
  rejectionNotes: string | null;
}

export interface PhotoApproval extends BaseEntity {
  photoVersionId: UUID;
  federationId: UUID;
  disciplineId: UUID | null;
  seasonId: string;
  registrationId: UUID | null;
  requestedByUserId: UUID;
  requestedAt: ISODateTime;
  decidedByUserId: UUID | null;
  decidedAt: ISODateTime | null;
  status: PhotoApprovalStatus;
  decisionReasonCode: string | null;
  decisionNotes: string | null;
  scope: PhotoApprovalScope;
  slaDueAt: ISODateTime | null;
}

export interface MatchSheetPhotoSnapshot extends BaseEntity {
  matchSheetId: UUID;
  matchId: UUID;
  registrationId: UUID;
  seasonRegistrationPhotoId: UUID;
  photoSubjectId: UUID;
  globalOfficialPhotoId: UUID;
  photoVersionId: UUID;
  photoEtag: string;
  renditionManifest: Record<string, unknown>;
  frozenAt: ISODateTime;
  frozenByUserId: UUID;
  freezeReason: string;
  auditCorrelationId: UUID;
}

export interface PhotoAccessGrant extends BaseEntity {
  photoVersionId: UUID;
  granteeType: PhotoGrantType;
  granteeId: UUID;
  scope: string;
  expiresAt: ISODateTime;
  revokedAt: ISODateTime | null;
}

export interface PhotoAuditEvent extends BaseEntity {
  correlationId: UUID;
  actorUserId: UUID | null;
  actorRole: string;
  federationId: UUID | null;
  seasonId: string | null;
  registrationId: UUID | null;
  photoSubjectId: UUID | null;
  photoVersionId: UUID | null;
  eventType: PhotoAuditEventType;
  payload: Record<string, unknown>;
  ipHash: string | null;
  userAgentHash: string | null;
}

export interface PhotoSyncCursor extends BaseEntity {
  scope: string;
  cursor: string;
  generatedAt: ISODateTime;
  invalidatedAt: ISODateTime | null;
}
