import type { BaseEntity, ISODateTime, UUID } from '../shared/types.js';

export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Match extends BaseEntity {
  federationId: UUID;
  homeClubId: UUID;
  awayClubId: UUID;
  refereeId: UUID | null;
  season: string;
  scheduledAt: ISODateTime;
  venue: string | null;
  status: MatchStatus;
}
