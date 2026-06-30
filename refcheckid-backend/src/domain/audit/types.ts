import type { BaseEntity, ISODateTime, UUID } from '../shared/types.js';

export interface AuditLog extends Pick<BaseEntity, 'id' | 'createdAt'> {
  actorFederationId: UUID | null;
  actorClubId: UUID | null;
  actorRefereeId: UUID | null;
  federationId: UUID | null;
  clubId: UUID | null;
  playerId: UUID | null;
  playerRegistrationId: UUID | null;
  staffMemberId: UUID | null;
  staffRegistrationId: UUID | null;
  refereeId: UUID | null;
  matchId: UUID | null;
  matchSheetId: UUID | null;
  matchSheetPlayerId: UUID | null;
  matchSheetStaffId: UUID | null;
  recognitionId: UUID | null;
  matchReportId: UUID | null;
  matchEventId: UUID | null;
  photoId: UUID | null;
  identityDocumentId: UUID | null;
  action: string;
  occurredAt: ISODateTime;
  metadata: Record<string, unknown>;
}
