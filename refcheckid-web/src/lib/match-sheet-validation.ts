import type { PlayerListItem, StaffListItem } from "./types";

export interface MatchSheetValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly missingNumbers: number;
  readonly invalidPlayers: number;
}

export function validateMatchSheet(
  players: readonly PlayerListItem[],
  staff: readonly StaffListItem[],
): MatchSheetValidationResult {
  const missingNumbers = players.filter((player) => player.shirtNumber === null).length;
  const invalidPlayers = players.filter((player) => player.suspended).length;
  const errors = [
    ...(players.length === 0 ? ["Seleziona almeno un giocatore convocato."] : []),
    ...(staff.length === 0 ? ["Seleziona almeno un membro dello staff."] : []),
    ...(missingNumbers > 0 ? ["Completa tutti i numeri maglia."] : []),
    ...(invalidPlayers > 0 ? ["Rimuovi i giocatori non validi dalla distinta."] : []),
  ];

  return { errors, invalidPlayers, isValid: errors.length === 0, missingNumbers };
}
