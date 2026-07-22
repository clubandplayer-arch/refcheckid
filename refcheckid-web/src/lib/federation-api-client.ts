import { fetchMatchReports, fetchMatches, request } from "./api-client";
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
  const pendingPhotoRequests = photos.filter(
    (photo) => photo.status === "pending",
  ).length;
  return {
    matchesPending: pendingMatches,
    reportsReceived: reports.length,
    pendingPhotoRequests,
    syncStatus: "ok",
    notifications: [
      `${reports.length} referti ricevuti`,
      `${pendingMatches} gare in attesa`,
      `${pendingPhotoRequests} richieste foto in attesa`,
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
  const [audit, photoAudit, registrationLabels] = await Promise.all([
    request<readonly Record<string, unknown>[]>(
      "/audit/by-action?action=MATCH_ARCHIVED",
    ),
    request<readonly Record<string, unknown>[]>("/photos/audit").catch(
      () => [],
    ),
    fetchRegistrationLabels(),
  ]);
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
        const eventType = String(
          item.eventType ?? item.event_type ?? "photo.audit",
        );
        const registrationId = String(
          item.registrationId ?? item.registration_id ?? "",
        );
        const photoVersionId = String(
          item.photoVersionId ?? item.photo_version_id ?? "",
        );
        const subjectLabel =
          registrationLabels.get(registrationId) ??
          (registrationId
            ? `Registrazione ${shortId(registrationId)}`
            : "Tesserato non identificato");
        const eventDescription = formatPhotoAuditEvent(eventType);
        return {
          id: String(item.id),
          auditSummary: [
            `Tesserato: ${subjectLabel}`,
            `Evento: ${eventDescription}`,
            `ID registrazione: ${registrationId || "n/d"}`,
            `Versione foto: ${shortId(photoVersionId) || "n/d"}`,
          ],
          clubNames: [],
          eventCategory: "photo" as const,
          eventDescription,
          matchLabel: `Foto tessera · ${eventDescription}`,
          refereeName: formatActorRole(
            String(item.actorRole ?? item.actor_role ?? "federation"),
          ),
          reportId: "",
        };
      }),
    ...audit.map((item) => {
      const eventDescription = formatMatchAuditEvent(
        String(item.action ?? "Audit"),
      );
      return {
        id: String(item.id),
        auditSummary: [
          `Evento: ${eventDescription}`,
          `ID gara/referto: ${String(item.entityId ?? item.entity_id ?? "n/d")}`,
        ],
        clubNames: [],
        eventCategory: "match" as const,
        eventDescription,
        matchLabel: `Gara archiviata · ${String(item.entityId ?? item.entity_id ?? "Gara")}`,
        refereeName: formatActorRole(
          String(item.actorId ?? item.actor_id ?? "sistema"),
        ),
        reportId: String(item.entityId ?? item.entity_id ?? ""),
      };
    }),
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
    refereeName: formatRefereeName(match.refereeId),
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

async function fetchRegistrationLabels(): Promise<Map<string, string>> {
  const [players, playerRegistrations, staffMembers, staffRegistrations] =
    await Promise.all([
      request<readonly Record<string, unknown>[]>("/players").catch(() => []),
      request<readonly Record<string, unknown>[]>(
        "/player-registrations",
      ).catch(() => []),
      request<readonly Record<string, unknown>[]>("/staff-members").catch(
        () => [],
      ),
      request<readonly Record<string, unknown>[]>("/staff-registrations").catch(
        () => [],
      ),
    ]);

  const playerById = new Map(
    players.map((player) => [String(player.id), player]),
  );
  const staffById = new Map(
    staffMembers.map((staff) => [String(staff.id), staff]),
  );
  const labels = new Map<string, string>();

  for (const registration of playerRegistrations) {
    const player = playerById.get(
      String(registration.playerId ?? registration.player_id),
    );
    labels.set(
      String(registration.id),
      formatHistorySubjectLabel(
        player,
        String(registration.clubId ?? registration.club_id),
        "Giocatore",
      ),
    );
  }

  for (const registration of staffRegistrations) {
    const staff = staffById.get(
      String(registration.staffMemberId ?? registration.staff_member_id),
    );
    labels.set(
      String(registration.id),
      formatHistorySubjectLabel(
        staff,
        String(registration.clubId ?? registration.club_id),
        "Staff",
      ),
    );
  }

  return labels;
}

function formatHistorySubjectLabel(
  subject: Record<string, unknown> | undefined,
  clubIdOrName: string,
  fallbackRole: string,
): string {
  const name = subject ? formatPersonName(subject, fallbackRole) : fallbackRole;
  const clubName = clubIdOrName
    ? formatClubName(clubIdOrName)
    : "Società non disponibile";
  return `${name} · ${clubName}`;
}

function formatPersonName(
  person: Record<string, unknown>,
  fallback: string,
): string {
  const fullName = person.fullName ?? person.full_name;
  if (typeof fullName === "string" && fullName.trim().length > 0) {
    return fullName.trim();
  }

  const firstName = person.firstName ?? person.first_name;
  const lastName = person.lastName ?? person.last_name;
  const parts = [firstName, lastName]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .map((value) => value.trim());

  return parts.length > 0 ? parts.join(" ") : fallback;
}

function shortId(value: string): string {
  return value ? value.slice(-12) : "";
}

function formatRefereeName(refereeIdOrName: string | null | undefined): string {
  if (!refereeIdOrName) return "Da assegnare";
  if (refereeIdOrName === "70000000-0000-4000-8000-000000000005") {
    return "Arbitro Demo";
  }
  return refereeIdOrName;
}

function normalizeReportStatus(status?: string) {
  if (status === "submitted" || status === "reviewed") return status;
  if (status === "draft") return "draft";
  if (status === "in_compilation") return "in_compilation";
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
    refereeName: formatRefereeName(report.refereeId),
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

function parseSubmittedReportSummary(summary: string | null): {
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
    const parsed = JSON.parse(summary) as ReturnType<
      typeof parseSubmittedReportSummary
    >;
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
    clubName:
      approval.clubName ?? `Federazione ${approval.federationId.slice(0, 8)}`,
    currentPhotoUrl:
      normalizeBrowserPhotoUrl(approval.currentPhotoUrl) ??
      photoVersionContentUrl(approval.currentVersionId),
    playerName:
      approval.subjectName ??
      approval.registrationId ??
      approval.photoVersionId,
    proposedPhotoUrl:
      normalizeBrowserPhotoUrl(approval.proposedPhotoUrl) ??
      photoVersionContentUrl(approval.proposedVersionId ?? approval.photoVersionId),
    requestedAt: approval.requestedAt,
    status: approval.status,
    reasonCode: approval.decisionReasonCode,
    notes: approval.decisionNotes,
    slaStatus: approval.slaStatus ?? null,
    photoEtag: approval.photoEtag ?? null,
  };
}

function photoVersionContentUrl(versionId: string | null | undefined): string | null {
  if (!versionId) return null;
  return `/api/v1/photos/versions/${encodeURIComponent(versionId)}/content?rendition=normalized`;
}

function normalizeBrowserPhotoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("file://")) return null;
  return value;
}

function formatPhotoAuditEvent(eventType: string): string {
  return (
    {
      "photo.approved": "approvata dalla Federazione",
      "photo.rejected": "rifiutata dalla Federazione",
      "photo.official_changed": "foto ufficiale aggiornata",
      "photo.version_viewed_for_approval": "visualizzata per approvazione",
    }[eventType] ?? eventType
  );
}

function formatMatchAuditEvent(action: string): string {
  return { MATCH_ARCHIVED: "referto archiviato" }[action] ?? action;
}

function formatActorRole(value: string): string {
  return (
    {
      federation: "Federazione",
      manager: "Dirigente",
      referee: "Arbitro",
      sistema: "Sistema",
      system: "Sistema",
    }[value] ?? formatRefereeName(value)
  );
}
