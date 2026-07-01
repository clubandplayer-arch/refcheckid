import type { PlayerListItem, StaffListItem } from "./types";

export interface MatchSheetValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly missingNumbers: number;
  readonly invalidPlayers: number;
  readonly duplicateShirtNumbers: readonly number[];
}

export function validateMatchSheet(
  players: readonly PlayerListItem[],
  staff: readonly StaffListItem[],
): MatchSheetValidationResult {
  const missingNumbers = players.filter((player) => player.shirtNumber === null).length;
  const invalidPlayers = players.filter((player) => player.suspended).length;
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
    ...(missingNumbers > 0 ? ["Completa tutti i numeri maglia."] : []),
    ...(duplicateShirtNumbers.length > 0
      ? [`Numeri di maglia duplicati: ${duplicateShirtNumbers.join(", ")}.`]
      : []),
    ...(invalidPlayers > 0 ? ["Rimuovi i giocatori non validi dalla distinta."] : []),
  ];

  return {
    duplicateShirtNumbers,
    errors,
    invalidPlayers,
    isValid: errors.length === 0,
    missingNumbers,
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
