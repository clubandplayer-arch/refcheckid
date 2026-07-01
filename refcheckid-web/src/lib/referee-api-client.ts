import {
  completeRecognition,
  fetchMatches,
  fetchMatchReports,
  fetchMatchSheets,
  fetchPlayers,
  startRecognition,
  submitMatchReport,
} from "./api-client";
import type { ApiMatch, ApiMatchSheet, ApiReport } from "./api-client";
import type {
  MatchReportDraft,
  RecognitionSubject,
  RefereeDashboard,
  TeamSheetVerification,
} from "./referee-types";

export async function fetchRefereeDashboard(): Promise<RefereeDashboard> {
  const matches = await fetchMatches();
  const nextMatch =
    [...matches].sort((a, b) =>
      a.scheduledAt.localeCompare(b.scheduledAt),
    )[0] ?? null;
  return {
    nextMatch: nextMatch ? toRefereeMatch(nextMatch) : null,
    notifications: nextMatch ? [`Gara ${nextMatch.status}`] : [],
  };
}

export async function fetchRefereeMatchSheets(
  matchId: string,
): Promise<readonly TeamSheetVerification[]> {
  const sheets = await fetchMatchSheets(
    `?matchId=${encodeURIComponent(matchId)}`,
  );
  return sheets.map(toTeamSheetVerification);
}

export async function fetchRecognitionSubjects(): Promise<
  readonly RecognitionSubject[]
> {
  const players = await fetchPlayers();
  return players.map((player) => ({
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    shirtNumber: player.shirtNumber ?? 0,
    teamName: "Club",
    photoUrl: player.photoUrl,
    document: {
      type: "Documento",
      number: player.id,
      expiresAt: new Date().toISOString(),
    },
    decision: "pending",
  }));
}

export async function fetchRefereeReport(
  matchId: string,
): Promise<MatchReportDraft> {
  const response = await fetchMatchReports(
    `?matchId=${encodeURIComponent(matchId)}`,
  );
  const report = Array.isArray(response) ? response[0] : response;
  return toReportDraft(report ?? null);
}

export { completeRecognition, startRecognition, submitMatchReport };

function toRefereeMatch(
  match: ApiMatch,
): NonNullable<RefereeDashboard["nextMatch"]> {
  return {
    id: match.id,
    awayTeam: match.awayClubId,
    homeTeam: match.homeClubId,
    scheduledAt: match.scheduledAt,
    status:
      match.status === "completed"
        ? "completed"
        : match.status === "in_progress"
          ? "recognition"
          : "scheduled",
    venue: match.venue ?? "Da definire",
  };
}

function toTeamSheetVerification(sheet: ApiMatchSheet): TeamSheetVerification {
  return {
    id: sheet.id,
    clubName: sheet.clubId,
    playerCount: 0,
    staffCount: 0,
    status:
      sheet.status === "locked"
        ? "locked"
        : sheet.status === "submitted"
          ? "submitted"
          : "missing",
    submittedAt: sheet.submittedAt,
    team: "home",
  };
}

function toReportDraft(report: ApiReport | null): MatchReportDraft {
  return {
    awayGoals: 0,
    cautions: [],
    expulsions: [],
    goals: [],
    homeGoals: 0,
    refereeNotes: report?.summary ?? "",
    substitutions: [],
  };
}
