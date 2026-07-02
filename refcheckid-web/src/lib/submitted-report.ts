import type { MatchReportDraft } from "./referee-types";

export interface SubmittedFederationReportEvent {
  id: string;
  minute: number;
  teamName: string;
  playerName: string;
  detail: string;
}

export interface SubmittedFederationReport {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  refereeName: string;
  status: "submitted" | "reviewed";
  result: {
    homeGoals: number;
    awayGoals: number;
  };
  goals: readonly SubmittedFederationReportEvent[];
  cautions: readonly SubmittedFederationReportEvent[];
  expulsions: readonly SubmittedFederationReportEvent[];
  substitutions: readonly SubmittedFederationReportEvent[];
  refereeNotes: string;
  submittedAt: string;
}

const submittedReportsStorageKey = "refcheckid.submittedReports";

export function saveSubmittedFederationReport(
  matchId: string,
  report: MatchReportDraft,
): SubmittedFederationReport | null {
  if (typeof window === "undefined") return null;
  const submittedReport: SubmittedFederationReport = {
    id: report.id ?? `${matchId}-submitted-report`,
    awayTeam: "Ospite",
    cautions: report.cautions.map(toSubmittedEvent),
    expulsions: report.expulsions.map(toSubmittedEvent),
    goals: report.goals.map(toSubmittedEvent),
    homeTeam: "Casa",
    matchId,
    refereeName: "Arbitro Demo",
    refereeNotes: report.refereeNotes,
    result: {
      awayGoals: report.awayGoals,
      homeGoals: report.homeGoals,
    },
    status: "submitted",
    substitutions: report.substitutions.map(toSubmittedEvent),
    submittedAt: new Date().toISOString(),
  };
  const reports = readSubmittedFederationReports();
  const nextReports = [
    submittedReport,
    ...reports.filter((item) => item.matchId !== matchId),
  ];
  window.localStorage.setItem(
    submittedReportsStorageKey,
    JSON.stringify(nextReports),
  );
  return submittedReport;
}

export function readSubmittedFederationReports(): readonly SubmittedFederationReport[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(submittedReportsStorageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SubmittedFederationReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toSubmittedEvent(
  event: MatchReportDraft["goals"][number],
): SubmittedFederationReportEvent {
  return {
    detail: event.detail,
    id: event.id,
    minute: event.minute,
    playerName:
      event.playerName ||
      event.outgoingPlayerName ||
      event.incomingPlayerName ||
      "Tesserato da verificare",
    teamName: event.teamName,
  };
}
