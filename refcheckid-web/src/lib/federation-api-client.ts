import {
  fetchMatchReports,
  fetchMatches,
  request,
} from "./api-client";
import type { ApiMatch, ApiReport } from "./api-client";
import { managerTeamConfig } from "./manager-team";
import type {
  FederationDashboard,
  FederationHistoryItem,
  FederationMatchListItem,
  FederationReport,
  PhotoRequest,
  PhotoRequestStatus,
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
  const matches = await fetchMatches();
  return Promise.all(
    matches.map(async (match) => {
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
  const backendReports = await Promise.all(
    matches.map((match) => fetchReportForMatch(match.id)),
  );
  return backendReports
    .filter(isSubmittedApiReport)
    .map((report) => toFederationReport(report, matchById.get(report.matchId)));
}

export interface ApiPhotoApproval {
  id: string;
  photoVersionId: string;
  federationId: string;
  seasonId: string;
  registrationId: string | null;
  requestedAt: string;
  status: PhotoRequestStatus;
  decisionReasonCode: string | null;
  decisionNotes: string | null;
  clubId?: string | null;
  clubName?: string | null;
  subjectName?: string | null;
  currentVersionId?: string | null;
  proposedVersionId?: string | null;
  currentPhotoUrl?: string | null;
  proposedPhotoUrl?: string | null;
  photoEtag?: string | null;
  slaStatus?: string | null;
}

export interface PhotoRequestFilters {
  readonly status?: PhotoRequestStatus | "all";
  readonly clubId?: string;
  readonly sla?: "all" | "overdue" | "on_track" | "not_set" | "closed";
}

export const federationRejectReasonCodes = [
  { code: "face_not_visible", label: "Volto non visibile" },
  { code: "document_mismatch", label: "Documento non coerente" },
  { code: "quality_issue", label: "Qualità immagine insufficiente" },
  { code: "duplicate_or_wrong_subject", label: "Soggetto errato o duplicato" },
] as const;

export async function fetchPhotoRequests(
  filters: PhotoRequestFilters = {},
): Promise<readonly PhotoRequest[]> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.clubId) params.set("clubId", filters.clubId);
  if (filters.sla && filters.sla !== "all") params.set("sla", filters.sla);
  const query = params.toString();
  const approvals = await request<readonly ApiPhotoApproval[]>(
    `/photo-approvals${query ? `?${query}` : ""}`,
  );
  return approvals.map(toPhotoRequest);
}

export function approvePhotoRequest(
  requestId: string,
  reasonCode = "identity_verified",
) {
  return request<ApiPhotoApproval>(
    `/photo-approvals/${encodeURIComponent(requestId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ actorRole: "federation", reasonCode }),
    },
  );
}

export function rejectPhotoRequest(
  requestId: string,
  reasonCode: string,
  notes: string,
) {
  return request<ApiPhotoApproval>(
    `/photo-approvals/${encodeURIComponent(requestId)}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ actorRole: "federation", reasonCode, notes }),
    },
  );
}

export async function fetchFederationHistory(): Promise<
  readonly FederationHistoryItem[]
> {
  const audit = await request<readonly Record<string, unknown>[]>(
    "/audit/by-action?action=MATCH_ARCHIVED",
  );
  const photoAudit = await request<readonly Record<string, unknown>[]>(
    "/photos/audit",
  ).catch(() => []);
  return [
    ...photoAudit
      .filter((item) =>
        [
          "photo.approved",
          "photo.rejected",
          "photo.official_changed",
          "photo.version_viewed_for_approval",
        ].includes(String(item.eventType ?? item.event_type ?? "")),
      )
      .map((item) => {
        const eventType = String(item.eventType ?? item.event_type ?? "photo.audit");
        const registrationId = String(item.registrationId ?? item.registration_id ?? "");
        return {
          id: String(item.id),
          auditSummary: [
            formatPhotoAuditEvent(eventType),
            `Registrazione: ${registrationId || "n/d"}`,
          ],
          clubNames: [],
          matchLabel: `Workflow foto ${registrationId || String(item.photoVersionId ?? item.photo_version_id ?? "")}`,
          refereeName: String(item.actorRole ?? item.actor_role ?? "Federazione"),
          reportId: "",
        };
      }),
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
  report: ApiReport,
  match?: ApiMatch,
): FederationReport {
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
  report: { homeTeam: string; awayTeam: string },
  match?: ApiMatch,
): { homeTeam: string; awayTeam: string } {
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
): {
  awayTeam: string;
  cautions: FederationReport["cautions"];
  expulsions: FederationReport["expulsions"];
  goals: FederationReport["goals"];
  homeTeam: string;
  refereeName: string;
  refereeNotes: string;
  result: FederationReport["result"];
  substitutions: FederationReport["substitutions"];
} | null {
  if (!summary) return null;
  try {
    const parsed = JSON.parse(summary) as ReturnType<typeof parseSubmittedReportSummary>;
    return parsed && typeof parsed === "object" && "result" in parsed
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function toPhotoRequest(approval: ApiPhotoApproval): PhotoRequest {
  return {
    id: approval.id,
    clubName: approval.clubName ?? `Federazione ${approval.federationId.slice(0, 8)}`,
    currentPhotoUrl: approval.currentPhotoUrl ?? (approval.currentVersionId
      ? `/api/v1/photos/versions/${approval.currentVersionId}/content`
      : null),
    playerName: approval.subjectName ?? approval.registrationId ?? approval.photoVersionId,
    proposedPhotoUrl:
      approval.proposedPhotoUrl ??
      `/api/v1/photos/versions/${approval.proposedVersionId ?? approval.photoVersionId}/content`,
    requestedAt: approval.requestedAt,
    status: approval.status,
    reasonCode: approval.decisionReasonCode,
    notes: approval.decisionNotes,
    slaStatus: approval.slaStatus ?? null,
    photoEtag: approval.photoEtag ?? null,
  };
}

function formatPhotoAuditEvent(eventType: string): string {
  return (
    {
      "photo.approved": "Foto approvata dalla federazione",
      "photo.rejected": "Foto rifiutata dalla federazione",
      "photo.official_changed": "Foto ufficiale aggiornata",
      "photo.version_viewed_for_approval": "Versione foto visualizzata per approvazione",
    }[eventType] ?? eventType
  );
}
