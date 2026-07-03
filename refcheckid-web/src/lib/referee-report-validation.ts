import type { MatchReportDraft, MatchReportEvent, RecognitionSubject } from "./referee-types";

export const reportTeams = ["Casa", "Ospite"] as const;
export const goalTypes = [
  "Azione",
  "Rigore",
  "Punizione",
  "Calcio d’angolo diretto",
  "Autogol",
] as const;
export const cautionReasons = [
  "Comportamento antisportivo",
  "Proteste",
  "Fallo di gioco",
  "Ritardo ripresa gioco",
  "Distanza non rispettata",
  "Altro",
] as const;
export const expulsionReasons = [
  "Doppia ammonizione",
  "Condotta violenta",
  "Grave fallo di gioco",
  "Linguaggio offensivo",
  "Condotta gravemente sleale",
  "Altro",
] as const;

export type ReportEventKey =
  | "cautions"
  | "expulsions"
  | "goals"
  | "substitutions";

export function resolveReportPlayerName(
  teamName: string,
  shirtNumber: number | null | undefined,
): string {
  if (!reportTeams.includes(teamName as (typeof reportTeams)[number])) {
    return "";
  }
  if (shirtNumber === null || shirtNumber === undefined || shirtNumber < 1) {
    return "";
  }
  return `${teamName} #${shirtNumber}`;
}

export function validateReportDraft(
  report: MatchReportDraft,
  recognitionSubjects: readonly RecognitionSubject[] = [],
): readonly string[] {
  return [
    ...validateGoalTotals(report),
    ...validateEventList("Gol", report.goals, true, recognitionSubjects),
    ...validateEventList("Ammonizioni", report.cautions, true, recognitionSubjects),
    ...validateEventList("Espulsioni", report.expulsions, true, recognitionSubjects),
    ...validateEventList("Sostituzioni", report.substitutions, false, recognitionSubjects),
    ...validateSubstitutions(report.substitutions),
  ];
}

export function countGoalsByTeam(report: MatchReportDraft): { home: number; away: number } {
  return {
    away: report.goals.filter((event) => event.teamName === "Ospite").length,
    home: report.goals.filter((event) => event.teamName === "Casa").length,
  };
}

function validateGoalTotals(report: MatchReportDraft): readonly string[] {
  const errors: string[] = [];
  const goalCounts = countGoalsByTeam(report);
  if (goalCounts.home !== report.homeGoals) {
    errors.push(
      `Gol: gol Casa inseriti ${goalCounts.home}/${report.homeGoals}.`,
    );
  }
  if (goalCounts.away !== report.awayGoals) {
    errors.push(
      `Gol: gol Ospite inseriti ${goalCounts.away}/${report.awayGoals}.`,
    );
  }
  if (report.goals.length > report.homeGoals + report.awayGoals) {
    errors.push("Gol: numero eventi superiore al risultato finale.");
  }
  return errors;
}

function validateEventList(
  label: string,
  events: readonly MatchReportEvent[],
  requiresPrimaryPlayer: boolean,
  recognitionSubjects: readonly RecognitionSubject[],
): readonly string[] {
  const errors: string[] = [];
  let previousMinute = 0;
  events.forEach((event, index) => {
    if (!Number.isInteger(event.minute) || event.minute < 1 || event.minute > 120) {
      errors.push(`${label}: minuto non valido alla riga ${index + 1}.`);
    }
    if (event.minute < previousMinute) {
      errors.push(`${label}: eventi non in ordine cronologico.`);
    }
    previousMinute = event.minute;
    if (!reportTeams.includes(event.teamName as (typeof reportTeams)[number])) {
      errors.push(`${label}: squadra mancante alla riga ${index + 1}.`);
    }
    if (requiresPrimaryPlayer && (event.shirtNumber === null || event.shirtNumber === undefined || event.shirtNumber < 1)) {
      errors.push(`${label}: numero maglia mancante alla riga ${index + 1}.`);
    }
    if (event.shirtNumber !== undefined && event.shirtNumber !== null) {
      const expectedName = resolveValidatedReportPlayerName(
        event.teamName,
        event.shirtNumber,
        recognitionSubjects,
      );
      const legacyName = resolveReportPlayerName(event.teamName, event.shirtNumber);
      if (expectedName === null) {
        errors.push(`${label}: tesserato non presente nella distinta della squadra.`);
      } else if (
        expectedName.length > 0 &&
        event.playerName !== expectedName &&
        event.playerName !== legacyName
      ) {
        errors.push(`${label}: tesserato non coerente con squadra e maglia.`);
      }
    }
  });
  return errors;
}

function resolveValidatedReportPlayerName(
  teamName: string,
  shirtNumber: number,
  recognitionSubjects: readonly RecognitionSubject[],
): string | null {
  if (recognitionSubjects.length === 0) {
    return resolveReportPlayerName(teamName, shirtNumber);
  }
  const teamNames = Array.from(new Set(recognitionSubjects.map((subject) => subject.teamName)));
  const selectedTeamIndex = teamName === "Casa" ? 0 : 1;
  const selectedTeamName = teamNames[selectedTeamIndex] ?? teamNames[0] ?? "";
  const subject = recognitionSubjects.find(
    (item) =>
      item.subjectKind === "player" &&
      item.teamName === selectedTeamName &&
      item.shirtNumber === shirtNumber,
  );
  return subject ? `${subject.lastName} ${subject.firstName}` : null;
}

function validateSubstitutions(
  substitutions: readonly MatchReportEvent[],
): readonly string[] {
  const errors: string[] = [];
  const usedPlayers = new Set<string>();
  substitutions.forEach((event, index) => {
    for (const shirtNumber of [event.outgoingShirtNumber, event.incomingShirtNumber]) {
      if (shirtNumber === null || shirtNumber === undefined) continue;
      const playerKey = `${event.teamName}:${shirtNumber}`;
      if (usedPlayers.has(playerKey)) {
        errors.push(`Sostituzioni: tesserato già usato alla riga ${index + 1}.`);
      }
      usedPlayers.add(playerKey);
    }
    if (
      event.outgoingShirtNumber !== null &&
      event.outgoingShirtNumber !== undefined &&
      event.outgoingShirtNumber === event.incomingShirtNumber
    ) {
      errors.push("Sostituzioni: entrante e uscente devono essere diversi.");
    }
  });
  return errors;
}
