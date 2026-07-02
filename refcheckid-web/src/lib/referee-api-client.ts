import {
  completeRecognition,
  fetchMatches,
  fetchMatchReports,
  fetchMatchSheets,
  lockMatchSheet,
  startRecognition,
  submitMatchReport,
  updateMatchReport,
} from "./api-client";
import { pilotPlayers, pilotStaff } from "./pilot-data";
import {
  buildPilotSubmittedMatchSheetSnapshot,
  readSubmittedMatchSheetSnapshot,
} from "./submitted-match-sheet";
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
  return sheets.map((sheet, index) => toTeamSheetVerification(sheet, index));
}

export async function fetchRecognitionSubjects(): Promise<
  readonly RecognitionSubject[]
> {
  const snapshot =
    readSubmittedMatchSheetSnapshot() ??
    buildPilotSubmittedMatchSheetSnapshot({
      players: pilotPlayers,
      staff: pilotStaff,
    });
  return [...snapshot.players, ...snapshot.staff].map((subject) => ({
    id: subject.id,
    firstName: subject.firstName,
    lastName: subject.lastName,
    shirtNumber: subject.shirtNumber,
    teamName: subject.teamName,
    roleLabel: subject.roleLabel,
    subjectKind: subject.subjectKind,
    photoUrl: subject.photoUrl,
    document: {
      type: subject.subjectKind === "player" ? "Documento atleta" : "Documento staff",
      number: subject.id,
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

export async function lockSubmittedSheetsAndStartRecognition(
  matchId: string,
): Promise<unknown> {
  const sheets = await fetchMatchSheets(
    `?matchId=${encodeURIComponent(matchId)}`,
  );
  await Promise.all(
    sheets
      .filter((sheet) => sheet.status !== "locked")
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
    awayTeam: "Ospite",
    cautions: report.cautions,
    expulsions: report.expulsions,
    goals: report.goals,
    homeTeam: "Casa",
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

function toTeamSheetVerification(
  sheet: ApiMatchSheet,
  index: number,
): TeamSheetVerification {
  const team = index === 0 ? "home" : "away";
  return {
    id: sheet.id,
    clubName:
      team === "home" ? `Casa · ${sheet.clubId}` : `Ospite · ${sheet.clubId}`,
    playerCount: 0,
    staffCount: 0,
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
