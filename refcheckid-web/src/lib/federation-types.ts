export type FederationMatchStatus =
  "scheduled" | "in_progress" | "completed" | "archived";
export type FederationReportStatus =
  "missing" | "draft" | "submitted" | "reviewed";
export type PhotoRequestStatus = "pending" | "approved" | "rejected";
export type SyncStatus = "ok" | "warning" | "failed";

export interface FederationDashboard {
  reportsReceived: number;
  matchesPending: number;
  pendingPhotoRequests: number;
  syncStatus: SyncStatus;
  notifications: readonly string[];
}

export interface FederationMatchListItem {
  id: string;
  matchday: number;
  scheduledAt: string;
  homeTeam: string;
  awayTeam: string;
  refereeName: string;
  matchStatus: FederationMatchStatus;
  reportStatus: FederationReportStatus;
}

export interface FederationReport {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  refereeName: string;
  commissionerNotes: string | null;
  refereeNotes: string;
  result: {
    homeGoals: number;
    awayGoals: number;
  };
  goals: readonly FederationReportEvent[];
  cautions: readonly FederationReportEvent[];
  expulsions: readonly FederationReportEvent[];
  substitutions: readonly FederationReportEvent[];
  submittedAt: string;
}

export interface FederationReportEvent {
  id: string;
  minute: number;
  teamName: string;
  playerName: string;
  detail: string;
}

export interface PhotoRequest {
  id: string;
  playerName: string;
  clubName: string;
  currentPhotoUrl: string | null;
  proposedPhotoUrl: string | null;
  status: PhotoRequestStatus;
  requestedAt: string;
  reasonCode?: string | null;
  notes?: string | null;
}

export interface FederationHistoryItem {
  id: string;
  matchLabel: string;
  clubNames: readonly string[];
  refereeName: string;
  reportId: string;
  auditSummary: readonly string[];
}
