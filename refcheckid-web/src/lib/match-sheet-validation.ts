import type { PlayerListItem, StaffListItem } from "./types";

export const lineupRoleOptions = [
  { label: "Titolare", value: "starter" },
  { label: "Riserva", value: "reserve" },
] as const;

export type PlayerStatusTone = "default" | "warning" | "suspended";

export function getPlayerStatusTone(player: PlayerListItem): PlayerStatusTone {
  if (player.suspended) return "suspended";
  if (player.warning) return "warning";
  return "default";
}

export function getPlayerStatusLabel(player: PlayerListItem): string {
  if (player.suspended) return "Squalificato";
  if (player.warning) return "Diffida";
  return "Disponibile";
}

export interface MatchSheetValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly missingNumbers: number;
  readonly invalidPlayers: number;
  readonly duplicateShirtNumbers: readonly number[];
  readonly goalkeepers: number;
  readonly startingGoalkeepers: number;
  readonly starters: number;
  readonly captains: number;
  readonly viceCaptains: number;
  readonly captainViceConflicts: number;
  readonly missingShirtNumberPlayers: readonly string[];
  readonly startingLineup: number;
  readonly benchPlayers: number;
}

export function validateMatchSheet(
  players: readonly PlayerListItem[],
  staff: readonly StaffListItem[],
): MatchSheetValidationResult {
  const missingShirtNumberPlayers = players
    .filter((player) => player.shirtNumber === null)
    .map((player) => `${player.lastName} ${player.firstName}`);
  const missingNumbers = missingShirtNumberPlayers.length;
  const invalidPlayers = players.filter((player) => player.suspended).length;
  const goalkeepers = players.filter((player) => player.isGoalkeeper).length;
  const starters = players.filter((player) => player.role === "starter");
  const starterCount = starters.length;
  const startingGoalkeepers = starters.filter((player) => player.isGoalkeeper).length;
  const startingLineup = starterCount;
  const benchPlayers = players.filter((player) => player.role === "reserve").length;
  const captains = players.filter((player) => player.isCaptain).length;
  const viceCaptains = players.filter((player) => player.isViceCaptain).length;
  const reserveCaptains = players.filter((player) => player.role === "reserve" && player.isCaptain).length;
  const reserveViceCaptains = players.filter((player) => player.role === "reserve" && player.isViceCaptain).length;
  const captainViceConflicts = players.filter(
    (player) => player.isCaptain && player.isViceCaptain,
  ).length;
  const shirtNumberCounts = new Map<number, number>();
  for (const player of players) {
    if (player.shirtNumber === null) continue;
    shirtNumberCounts.set(
      player.shirtNumber,
      (shirtNumberCounts.get(player.shirtNumber) ?? 0) + 1,
    );
  }
  const duplicateShirtNumbers = [...shirtNumberCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([shirtNumber]) => shirtNumber)
    .sort((left, right) => left - right);
  const errors = [
    ...(players.length === 0 ? ["Seleziona almeno un giocatore convocato."] : []),
    ...(staff.length === 0 ? ["Seleziona almeno un membro dello staff."] : []),
    ...(missingNumbers > 0
      ? [`Completa i numeri maglia per: ${missingShirtNumberPlayers.join(", ")}.`]
      : []),
    ...(duplicateShirtNumbers.length > 0
      ? [`Numeri di maglia duplicati: ${duplicateShirtNumbers.join(", ")}.`]
      : []),
    ...(invalidPlayers > 0 ? ["Rimuovi i giocatori non validi dalla distinta."] : []),
    ...(startingGoalkeepers === 0 ? ["Seleziona un Portiere tra gli 11 titolari."] : []),
    ...(startingGoalkeepers > 1 ? ["Seleziona un solo Portiere tra gli 11 titolari."] : []),
    ...(startingLineup < 11
      ? ["Seleziona 11 titolari per completare la distinta."]
      : []),
    ...(startingLineup > 11 ? ["Seleziona al massimo 11 titolari."] : []),
    ...(benchPlayers > 20 ? ["Seleziona al massimo 20 giocatori in panchina."] : []),
    ...(staff.length > 5 ? ["Seleziona al massimo 5 membri dello staff in panchina."] : []),
    ...(captains > 1 ? ["Seleziona al massimo un Capitano."] : []),
    ...(reserveCaptains > 0 ? ["Il Capitano deve essere scelto tra i titolari."] : []),
    ...(viceCaptains > 1 ? ["Seleziona al massimo un Vice capitano."] : []),
    ...(reserveViceCaptains > 0 ? ["Il Vice capitano deve essere scelto tra i titolari."] : []),
    ...(captainViceConflicts > 0
      ? ["Capitano e Vice capitano devono essere giocatori diversi."]
      : []),
  ];

  return {
    benchPlayers,
    captainViceConflicts,
    captains,
    duplicateShirtNumbers,
    errors,
    goalkeepers,
    startingGoalkeepers,
    invalidPlayers,
    isValid: errors.length === 0,
    missingNumbers,
    missingShirtNumberPlayers,
    starters: starterCount,
    startingLineup,
    viceCaptains,
  };
}

export function getMatchSheetSubmitError(
  validation: MatchSheetValidationResult,
): string | null {
  if (validation.isValid) return null;
  if (validation.duplicateShirtNumbers.length > 0)
    return "Numeri di maglia duplicati";
  return "Distinta non valida";
}
