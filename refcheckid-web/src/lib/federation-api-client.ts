import {
  fetchMatchReports,
  fetchMatches,
  fetchPhotos,
  request,
} from "./api-client";
import type { ApiMatch, ApiPhoto, ApiReport } from "./api-client";
import { managerTeamConfig } from "./manager-team";
import { readManagerPhotoApprovalRequests } from "./manager-photo-store";
import { readSubmittedFederationReports } from "./submitted-report";
import type { SubmittedFederationReport } from "./submitted-report";
import type {
  FederationDashboard,
  FederationHistoryItem,
  FederationMatchListItem,
  FederationReport,
  PhotoRequest,
} from "./federation-types";

export async function fetchFederationDashboard(): Promise<FederationDashboard> {
  const [reports, photos, matches] = await Promise.all([
    fetchFederationReports(),
    fetchPhotoRequests(),
    fetchFederationMatches(),
  ]);
  const pendingMatches = matches.filter(
    (match) =>
      match.reportStatus !== "submitted" && match.reportStatus !== "reviewed",
  ).length;
  return {
    matchesPending: pendingMatches,
    reportsReceived: reports.length,
    pendingPhotoRequests: photos.filter((photo) => photo.status === "pending")
      .length,
    syncStatus: "ok",
    notifications: [
      `${reports.length} referti ricevuti`,
      `${pendingMatches} gare in attesa`,
      `${photos.length} richieste foto`,
    ],
  };
}

export async function fetchFederationMatches(): Promise<
  readonly FederationMatchListItem[]
> {
  const [matches, submittedReports] = await Promise.all([
    fetchMatches(),
    Promise.resolve(readSubmittedFederationReports()),
  ]);
  const reportByMatchId = new Map(
    submittedReports.map((report) => [report.matchId, report]),
  );
  return Promise.all(
    matches.map(async (match) => {
      const submittedReport = reportByMatchId.get(match.id);
      if (submittedReport) {
        return toFederationMatch(match, submittedReport.status);
      }
      const backendReport = await fetchReportForMatch(match.id);
      return toFederationMatch(match, backendReport?.status);
    }),
  );
}

export async function fetchFederationReports(): Promise<
  readonly FederationReport[]
> {
  const matches = await fetchMatches();
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const localReports = readSubmittedFederationReports().map((report) =>
    toFederationReport(report, matchById.get(report.matchId)),
  );
  const backendReports = await Promise.all(
    matches.map((match) => fetchReportForMatch(match.id)),
  );
  const localIds = new Set(localReports.map((report) => report.id));
  const backendSubmittedReports = backendReports
    .filter(isSubmittedApiReport)
    .filter((report) => !localIds.has(report.id))
    .map((report) => toFederationReport(report, matchById.get(report.matchId)));
  return [...localReports, ...backendSubmittedReports];
}

export async function fetchPhotoRequests(): Promise<readonly PhotoRequest[]> {
  const [photos, localRequests] = await Promise.all([
    fetchPhotos(),
    Promise.resolve(readManagerPhotoApprovalRequests()),
  ]);
  return [...localRequests, ...photos.map(toPhotoRequest)];
}

export async function fetchFederationHistory(): Promise<
  readonly FederationHistoryItem[]
> {
  const matches = await fetchMatches();
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const reportHistory = readSubmittedFederationReports().map((report) => {
    const teams = resolveReportTeams(report, matchById.get(report.matchId));
    return {
      id: `history-${report.id}`,
      auditSummary: [
        "Referto ricevuto dalla Federazione",
        `Risultato ${report.result.homeGoals}-${report.result.awayGoals}`,
        `Eventi: ${report.goals.length} gol, ${report.cautions.length} ammonizioni, ${report.expulsions.length} espulsioni, ${report.substitutions.length} sostituzioni`,
      ],
      clubNames: [teams.homeTeam, teams.awayTeam],
      matchLabel: `${teams.homeTeam} - ${teams.awayTeam}`,
      refereeName: report.refereeName,
      reportId: report.id,
    };
  });

  const audit = await request<readonly Record<string, unknown>[]>(
    "/audit/by-action?action=MATCH_ARCHIVED",
  );
  return [
    ...reportHistory,
    ...audit.map((item) => ({
      id: String(item.id),
      auditSummary: [String(item.action ?? "Audit")],
      clubNames: [],
      matchLabel: String(item.entityId ?? item.entity_id ?? "Gara"),
      refereeName: String(item.actorId ?? item.actor_id ?? "—"),
      reportId: String(item.entityId ?? item.entity_id ?? ""),
    })),
  ];
}

async function fetchReportForMatch(matchId: string): Promise<ApiReport | null> {
  const response = await fetchMatchReports(
    `?matchId=${encodeURIComponent(matchId)}`,
  );
  if (Array.isArray(response)) {
    const reports = response as readonly ApiReport[];
    return reports[0] ?? null;
  }
  return (response as ApiReport | null) ?? null;
}

function isSubmittedApiReport(report: ApiReport | null): report is ApiReport {
  return Boolean(report?.submittedAt || report?.status === "submitted");
}

function toFederationMatch(
  match: ApiMatch,
  reportStatus?: string,
): FederationMatchListItem {
  const normalizedReportStatus = normalizeReportStatus(reportStatus);
  return {
    id: match.id,
    awayTeam: formatClubName(match.awayClubId),
    homeTeam: formatClubName(match.homeClubId),
    matchStatus:
      match.status === "completed"
        ? "completed"
        : match.status === "in_progress"
          ? "in_progress"
          : "scheduled",
    matchday: new Date(match.scheduledAt).getUTCDate(),
    refereeName: match.refereeId ?? "Da assegnare",
    reportStatus: normalizedReportStatus,
    scheduledAt: match.scheduledAt,
  };
}

function formatClubName(clubIdOrName: string): string {
  const club = Object.values(managerTeamConfig).find(
    (team) => team.clubId === clubIdOrName,
  );
  return club?.label ?? clubIdOrName;
}

function normalizeReportStatus(status?: string) {
  if (status === "submitted" || status === "reviewed") return status;
  if (status === "draft") return "draft";
  return "missing";
}

function toFederationReport(
  report: ApiReport | SubmittedFederationReport,
  match?: ApiMatch,
): FederationReport {
  if ("result" in report) {
    const teams = resolveReportTeams(report, match);
    return {
      id: report.id,
      awayTeam: teams.awayTeam,
      cautions: report.cautions,
      commissionerNotes: null,
      expulsions: report.expulsions,
      goals: report.goals,
      homeTeam: teams.homeTeam,
      matchId: report.matchId,
      refereeName: report.refereeName,
      refereeNotes: report.refereeNotes,
      result: report.result,
      substitutions: report.substitutions,
      submittedAt: report.submittedAt,
    };
  }
  const summary = parseSubmittedReportSummary(report.summary);
  if (summary) {
    const teams = resolveReportTeams(summary, match);
    return {
      id: report.id,
      awayTeam: teams.awayTeam,
      cautions: summary.cautions,
      commissionerNotes: null,
      expulsions: summary.expulsions,
      goals: summary.goals,
      homeTeam: teams.homeTeam,
      matchId: report.matchId,
      refereeName: summary.refereeName,
      refereeNotes: summary.refereeNotes,
      result: summary.result,
      substitutions: summary.substitutions,
      submittedAt: report.submittedAt ?? new Date().toISOString(),
    };
  }

  const fallbackTeams = match
    ? resolveReportTeams(
        { homeTeam: match.homeClubId, awayTeam: match.awayClubId },
        match,
      )
    : { homeTeam: report.matchId, awayTeam: report.matchId };

  return {
    id: report.id,
    cautions: [],
    commissionerNotes: null,
    expulsions: [],
    goals: [],
    homeTeam: fallbackTeams.homeTeam,
    awayTeam: fallbackTeams.awayTeam,
    matchId: report.matchId,
    refereeName: report.refereeId,
    refereeNotes: report.summary ?? "Referto ricevuto.",
    result: { awayGoals: 0, homeGoals: 0 },
    substitutions: [],
    submittedAt: report.submittedAt ?? new Date().toISOString(),
  };
}

function resolveReportTeams(
  report: Pick<SubmittedFederationReport, "homeTeam" | "awayTeam">,
  match?: ApiMatch,
): Pick<SubmittedFederationReport, "homeTeam" | "awayTeam"> {
  if (match) {
    return {
      awayTeam: formatClubName(match.awayClubId),
      homeTeam: formatClubName(match.homeClubId),
    };
  }

  return {
    awayTeam: formatClubName(report.awayTeam),
    homeTeam: formatClubName(report.homeTeam),
  };
}

function parseSubmittedReportSummary(
  summary: string | null,
): SubmittedFederationReport | null {
  if (!summary) return null;
  try {
    const parsed = JSON.parse(summary) as SubmittedFederationReport;
    return parsed && typeof parsed === "object" && "result" in parsed
      ? parsed
      : null;
  } catch {
    return null;
  }
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
