import {
  completeRecognition,
  fetchMatches,
  fetchMatchPhotoManifest,
  fetchMatchReports,
  fetchMatchSheets,
  lockMatchSheet,
  startRecognition,
  submitMatchReport,
  updateMatchReport,
} from "./api-client";
import { managerTeamConfig } from "./manager-team";
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
    notifications: nextMatch
      ? [toRefereeMatchNotification(nextMatch.status)]
      : [],
  };
}

function toRefereeMatchNotification(status: string): string {
  return (
    {
      completed: "Gara completata",
      in_progress: "Gara in corso",
      scheduled: "Gara programmata",
    }[status] ?? `Gara ${status}`
  );
}

export async function fetchRefereeMatchSheets(
  matchId: string,
): Promise<readonly TeamSheetVerification[]> {
  const sheets = await fetchMatchSheets(
    `?matchId=${encodeURIComponent(matchId)}`,
  );
  return sheets.map((sheet, index) => toTeamSheetVerification(sheet, index));
}

export async function fetchRecognitionSubjects(
  matchId?: string,
): Promise<readonly RecognitionSubject[]> {
  if (!matchId) return [];
  const manifest = await fetchMatchPhotoManifest(matchId);
  if (manifest.status !== "available") return [];
  return manifest.subjects.map((subject) => ({
    ...subject,
    decision: "pending",
    photoUrl: normalizeBrowserPhotoUrl(subject.photoUrl),
    teamName: formatClubName(subject.teamName),
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

export async function lockSubmittedSheetsAndStartRecognition(
  matchId: string,
): Promise<unknown> {
  const sheets = await fetchMatchSheets(
    `?matchId=${encodeURIComponent(matchId)}`,
  );
  await Promise.all(
    sheets
      .filter((sheet) => sheet.status === "submitted")
      .map((sheet) => lockMatchSheet(sheet.id)),
  );
  return startRecognition(matchId);
}

export { completeRecognition };

export async function submitRefereeReport(
  matchId: string,
  report: MatchReportDraft,
): Promise<ApiReport> {
  const reportId = report.id ?? matchId;
  await updateMatchReport(
    reportId,
    JSON.stringify(toSubmittedReportSummary(matchId, report)),
  );
  return submitMatchReport(reportId);
}

function toSubmittedReportSummary(matchId: string, report: MatchReportDraft) {
  return {
    awayTeam: managerTeamConfig.away.label,
    cautions: report.cautions,
    expulsions: report.expulsions,
    goals: report.goals,
    homeTeam: managerTeamConfig.home.label,
    matchId,
    refereeName: "Arbitro Demo",
    refereeNotes: report.refereeNotes,
    result: {
      awayGoals: report.awayGoals,
      homeGoals: report.homeGoals,
    },
    substitutions: report.substitutions,
  };
}

function formatClubName(value: string): string {
  if (value === managerTeamConfig.home.clubId)
    return managerTeamConfig.home.label;
  if (value === managerTeamConfig.away.clubId)
    return managerTeamConfig.away.label;
  return value;
}

function normalizeBrowserPhotoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.startsWith("file://")) return null;
  return value;
}

function toRefereeMatch(
  match: ApiMatch,
): NonNullable<RefereeDashboard["nextMatch"]> {
  return {
    id: match.id,
    awayTeam: formatClubName(match.awayClubId),
    homeTeam: formatClubName(match.homeClubId),
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

function toTeamSheetVerification(
  sheet: ApiMatchSheet,
  _index: number,
): TeamSheetVerification {
  const team = sheet.clubId === managerTeamConfig.away.clubId ? "away" : "home";
  return {
    id: sheet.id,
    clubName: formatClubName(sheet.clubId),
    playerCount: sheet.playerCount ?? 0,
    staffCount: sheet.staffCount ?? 0,
    status:
      sheet.status === "locked"
        ? "locked"
        : sheet.status === "submitted"
          ? "submitted"
          : "missing",
    submittedAt: sheet.submittedAt,
    team,
  };
}

function toReportDraft(report: ApiReport | null): MatchReportDraft {
  return {
    id: report?.id ?? null,
    status: report?.status ?? "draft",
    awayGoals: 0,
    cautions: [],
    expulsions: [],
    goals: [],
    homeGoals: 0,
    refereeNotes: report?.summary ?? "",
    substitutions: [],
  };
}
