import type { BaseEntity, ISODateTime, UUID } from '../shared/types.js';

export type MatchReportStatus = 'draft' | 'submitted' | 'locked';

export interface MatchReport extends BaseEntity {
  matchId: UUID;
  refereeId: UUID;
  submittedAt: ISODateTime | null;
  status: MatchReportStatus;
  summary: string | null;
}
