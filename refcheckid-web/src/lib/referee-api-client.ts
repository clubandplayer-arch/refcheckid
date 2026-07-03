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
import { managerTeamConfig } from "./manager-team";
import { applyManagerPhotoOverrides } from "./manager-photo-store";
import { pilotAwayPlayers, pilotAwayStaff, pilotPlayers, pilotStaff } from "./pilot-data";
import {
  buildPilotAwaySubmittedMatchSheetSnapshot,
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
    notifications: nextMatch ? [toRefereeMatchNotification(nextMatch.status)] : [],
  };
}

function toRefereeMatchNotification(status: string): string {
  return {
    completed: "Gara completata",
    in_progress: "Gara in corso",
    scheduled: "Gara programmata",
  }[status] ?? `Gara ${status}`;
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
  const sheets = await fetchMatchSheets();
  const homeSubmitted = sheets.some(
    (sheet) => sheet.clubId === managerTeamConfig.home.clubId && sheet.status !== "draft",
  );
  const awaySubmitted = sheets.some(
    (sheet) => sheet.clubId === managerTeamConfig.away.clubId && sheet.status !== "draft",
  );
  const homeSnapshot = homeSubmitted
    ? readSubmittedMatchSheetSnapshot("home") ??
      buildPilotSubmittedMatchSheetSnapshot({
        players: applyManagerPhotoOverrides("home", pilotPlayers),
        staff: applyManagerPhotoOverrides("home", pilotStaff),
      })
    : null;
  const awaySnapshot = awaySubmitted
    ? readSubmittedMatchSheetSnapshot("away") ??
      buildPilotAwaySubmittedMatchSheetSnapshot({
        players: applyManagerPhotoOverrides("away", pilotAwayPlayers),
        staff: applyManagerPhotoOverrides("away", pilotAwayStaff),
      })
    : null;
  return [
    ...(homeSnapshot?.players ?? []),
    ...(homeSnapshot?.staff ?? []),
    ...(awaySnapshot?.players ?? []),
    ...(awaySnapshot?.staff ?? []),
  ].map((subject) => ({
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
  _index: number,
): TeamSheetVerification {
  const team = sheet.clubId === managerTeamConfig.away.clubId ? "away" : "home";
  const snapshot = readSubmittedMatchSheetSnapshot(team);
  const fallbackSnapshot = team === "home"
    ? buildPilotSubmittedMatchSheetSnapshot({
        players: applyManagerPhotoOverrides("home", pilotPlayers),
        staff: applyManagerPhotoOverrides("home", pilotStaff),
      })
    : buildPilotAwaySubmittedMatchSheetSnapshot({
        players: applyManagerPhotoOverrides("away", pilotAwayPlayers),
        staff: applyManagerPhotoOverrides("away", pilotAwayStaff),
      });
  const submittedSnapshot = sheet.status === "draft" ? null : snapshot ?? fallbackSnapshot;
  return {
    id: sheet.id,
    clubName:
      team === "home"
        ? `${managerTeamConfig.home.label} · ${sheet.clubId}`
        : `${managerTeamConfig.away.label} · ${sheet.clubId}`,
    playerCount: submittedSnapshot?.players.length ?? 0,
    staffCount: submittedSnapshot?.staff.length ?? 0,
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
