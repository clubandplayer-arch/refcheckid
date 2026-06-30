import type { BaseEntity, UUID } from '../shared/types.js';

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
