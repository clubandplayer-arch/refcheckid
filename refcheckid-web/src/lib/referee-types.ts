export type RefereeMatchStatus =
  | "scheduled"
  | "sheets_locked"
  | "recognition"
  | "completed"
  | "reported";
export type SheetVerificationStatus = "locked" | "submitted" | "missing";
export type RecognitionDecision = "pending" | "approved" | "rejected";

export interface RefereeDashboard {
  nextMatch: RefereeMatchSummary | null;
  notifications: readonly string[];
}

export interface RefereeMatchSummary {
  id: string;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: string;
  venue: string;
  status: RefereeMatchStatus;
}

export interface TeamSheetVerification {
  id: string;
  team: "home" | "away";
  clubName: string;
  status: SheetVerificationStatus;
  submittedAt: string | null;
  playerCount: number;
  staffCount: number;
}

export interface RecognitionSubject {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number;
  teamName: string;
  photoUrl: string | null;
  document: {
    type: string;
    number: string;
    expiresAt: string;
  };
  decision: RecognitionDecision;
}

export interface MatchReportDraft {
  id: string | null;
  homeGoals: number;
  awayGoals: number;
  goals: readonly MatchReportEvent[];
  cautions: readonly MatchReportEvent[];
  expulsions: readonly MatchReportEvent[];
  substitutions: readonly MatchReportEvent[];
  refereeNotes: string;
}

export interface MatchReportEvent {
  id: string;
  minute: number;
  teamName: string;
  playerName: string;
  detail: string;
}
