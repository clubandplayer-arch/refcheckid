import type {
  AuditLog,
  Club,
  Federation,
  IdentityDocument,
  Match,
  MatchReport,
  MatchSheet,
  Photo,
  Player,
  PlayerRegistration,
  Recognition,
  Referee,
  StaffMember,
  StaffRegistration,
} from '../domain/index.js';

export type FederationResponseDto = Federation;
export type ClubResponseDto = Club;
export type PlayerResponseDto = Player;
export type PlayerRegistrationResponseDto = PlayerRegistration;
export type StaffMemberResponseDto = StaffMember;
export type StaffRegistrationResponseDto = StaffRegistration;
export type RefereeResponseDto = Referee;
export type MatchResponseDto = Match;
export type MatchSheetResponseDto = MatchSheet;
export type RecognitionResponseDto = Recognition;
export type MatchReportResponseDto = MatchReport;
export type AuditResponseDto = AuditLog;
export type PhotoResponseDto = Photo;
export type IdentityDocumentResponseDto = IdentityDocument;

export interface TransitionMatchStatusRequestDto {
  readonly status: string;
}

export interface CreateMatchReportRequestDto {
  readonly matchId: string;
  readonly refereeId: string;
  readonly summary?: string | null;
}

export interface UpdateMatchReportRequestDto {
  readonly summary?: string | null;
}

export interface RecognitionWorkflowRequestDto {
  readonly matchId: string;
}
