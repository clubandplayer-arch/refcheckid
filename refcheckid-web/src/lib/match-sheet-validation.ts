import type { PlayerListItem, StaffListItem } from "./types";

export const lineupRoleOptions = [
  { label: "Portiere", value: "goalkeeper" },
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
  readonly starters: number;
  readonly captains: number;
  readonly viceCaptains: number;
  readonly captainViceConflicts: number;
  readonly missingShirtNumberPlayers: readonly string[];
  readonly startingLineup: number;
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
  const goalkeepers = players.filter((player) => player.role === "goalkeeper").length;
  const starters = players.filter((player) => player.role === "starter").length;
  const startingLineup = goalkeepers + starters;
  const captains = players.filter((player) => player.isCaptain).length;
  const viceCaptains = players.filter((player) => player.isViceCaptain).length;
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
    ...(goalkeepers === 0 ? ["Seleziona almeno un Portiere."] : []),
    ...(startingLineup < 11
      ? ["Seleziona almeno 11 titolari/portieri per lo smoke test."]
      : []),
    ...(captains > 1 ? ["Seleziona al massimo un Capitano."] : []),
    ...(viceCaptains > 1 ? ["Seleziona al massimo un Vice capitano."] : []),
    ...(captainViceConflicts > 0
      ? ["Capitano e Vice capitano devono essere giocatori diversi."]
      : []),
  ];

  return {
    captainViceConflicts,
    captains,
    duplicateShirtNumbers,
    errors,
    goalkeepers,
    invalidPlayers,
    isValid: errors.length === 0,
    missingNumbers,
    missingShirtNumberPlayers,
    starters,
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
