import type { BaseEntity, ISODateTime, UUID } from '../shared/types.js';

export type RecognitionStatus = 'recognized' | 'rejected';

export interface Recognition extends BaseEntity {
  matchId: UUID;
  refereeId: UUID;
  matchSheetPlayerId: UUID | null;
  matchSheetStaffId: UUID | null;
  recognizedAt: ISODateTime;
  status: RecognitionStatus;
  notes: string | null;
}
