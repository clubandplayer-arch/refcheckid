import type { BaseEntity, ISODateTime, UUID } from '../shared/types.js';

export type MatchSheetStatus = 'draft' | 'submitted' | 'locked';
export type MatchSheetPersonStatus = 'listed' | 'recognized' | 'excluded';

export interface MatchSheet extends BaseEntity {
  matchId: UUID;
  clubId: UUID;
  submittedAt: ISODateTime | null;
  status: MatchSheetStatus;
}

export interface MatchSheetPlayer extends BaseEntity {
  matchSheetId: UUID;
  playerRegistrationId: UUID;
  shirtNumber: number | null;
  role: string;
  status: MatchSheetPersonStatus;
}

export interface MatchSheetStaff extends BaseEntity {
  matchSheetId: UUID;
  staffRegistrationId: UUID;
  role: string;
  status: MatchSheetPersonStatus;
}
