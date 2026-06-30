import type { BaseEntity, ISODateTime, UUID } from '../shared/types.js';

export interface MatchEvent extends BaseEntity {
  matchId: UUID;
  matchReportId: UUID | null;
  eventType: string;
  occurredAt: ISODateTime;
  minute: number | null;
  matchSheetPlayerId: UUID | null;
  matchSheetStaffId: UUID | null;
  clubId: UUID | null;
  refereeId: UUID | null;
  description: string | null;
}
