import {
  fetchMatchReports,
  fetchMatches,
  fetchPhotos,
  request,
} from "./api-client";
import type { ApiMatch, ApiPhoto, ApiReport } from "./api-client";
import type {
  FederationDashboard,
  FederationHistoryItem,
  FederationMatchListItem,
  FederationReport,
  PhotoRequest,
} from "./federation-types";

export async function fetchFederationDashboard(): Promise<FederationDashboard> {
  const [reports, photos] = await Promise.all([
    fetchFederationReports(),
    fetchPhotoRequests(),
  ]);
  return {
    reportsReceived: reports.length,
    pendingPhotoRequests: photos.filter((photo) => photo.status === "pending")
      .length,
    syncStatus: "ok",
    notifications: [
      `${reports.length} referti disponibili`,
      `${photos.length} richieste foto`,
    ],
  };
}

export async function fetchFederationMatches(): Promise<
  readonly FederationMatchListItem[]
> {
  const matches = await fetchMatches();
  return matches.map(toFederationMatch);
}

export async function fetchFederationReports(): Promise<
  readonly FederationReport[]
> {
  const response = await fetchMatchReports();
  const reports = Array.isArray(response)
    ? response
    : response
      ? [response]
      : [];
  return reports.map(toFederationReport);
}

export async function fetchPhotoRequests(): Promise<readonly PhotoRequest[]> {
  const photos = await fetchPhotos();
  return photos.map(toPhotoRequest);
}

export async function fetchFederationHistory(): Promise<
  readonly FederationHistoryItem[]
> {
  const audit = await request<readonly Record<string, unknown>[]>(
    "/audit/by-action?action=MATCH_ARCHIVED",
  );
  return audit.map((item) => ({
    id: String(item.id),
    auditSummary: [String(item.action ?? "Audit")],
    clubNames: [],
    matchLabel: String(item.entityId ?? item.entity_id ?? "Gara"),
    refereeName: String(item.actorId ?? item.actor_id ?? "—"),
    reportId: String(item.entityId ?? item.entity_id ?? ""),
  }));
}

function toFederationMatch(match: ApiMatch): FederationMatchListItem {
  return {
    id: match.id,
    awayTeam: match.awayClubId,
    homeTeam: match.homeClubId,
    matchStatus:
      match.status === "completed"
        ? "completed"
        : match.status === "in_progress"
          ? "in_progress"
          : "scheduled",
    matchday: new Date(match.scheduledAt).getUTCDate(),
    refereeName: match.refereeId ?? "Da assegnare",
    reportStatus: match.status === "completed" ? "submitted" : "missing",
    scheduledAt: match.scheduledAt,
  };
}

function toFederationReport(report: ApiReport): FederationReport {
  return {
    id: report.id,
    cautions: [],
    commissionerNotes: null,
    expulsions: [],
    goals: [],
    homeTeam: report.matchId,
    awayTeam: report.matchId,
    matchId: report.matchId,
    refereeName: report.refereeId,
    refereeNotes: report.summary ?? "",
    result: { awayGoals: 0, homeGoals: 0 },
    substitutions: [],
    submittedAt: report.submittedAt ?? "",
  };
}

function toPhotoRequest(photo: ApiPhoto): PhotoRequest {
  return {
    id: photo.id,
    clubName: "Club",
    currentPhotoUrl: null,
    playerName: photo.playerId ?? photo.id,
    proposedPhotoUrl: photo.storagePath ?? null,
    requestedAt: "",
    status:
      photo.status === "approved"
        ? "approved"
        : photo.status === "rejected"
          ? "rejected"
          : "pending",
  };
}
