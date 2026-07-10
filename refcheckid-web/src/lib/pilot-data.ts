import type { PlayerListItem, StaffListItem } from "./types";

const homePlayerNames = [
  ["Matteo", "Rinaldi"],
  ["Luca", "Ferrari"],
  ["Andrea", "Conti"],
  ["Davide", "Moretti"],
  ["Simone", "Gallo"],
  ["Marco", "De Luca"],
  ["Federico", "Romano"],
  ["Alessio", "Greco"],
  ["Gabriele", "Marini"],
  ["Tommaso", "Leone"],
  ["Riccardo", "Costa"],
  ["Edoardo", "Fontana"],
  ["Nicolò", "Serra"],
  ["Pietro", "Villa"],
  ["Samuele", "Barbieri"],
  ["Daniele", "Ferri"],
  ["Giacomo", "Monti"],
  ["Leonardo", "Riva"],
] as const;

const awayPlayerNames = [
  ["Antonio", "Marchetti"],
  ["Francesco", "Lombardi"],
  ["Michele", "Bianchi"],
  ["Emanuele", "Caruso"],
  ["Giorgio", "Pellegrini"],
  ["Vittorio", "Sanna"],
  ["Cristian", "Ruggieri"],
  ["Manuel", "Longo"],
  ["Fabio", "Sala"],
  ["Stefano", "Neri"],
  ["Lorenzo", "Martini"],
  ["Filippo", "Grassi"],
  ["Enrico", "D'Amico"],
  ["Claudio", "Palmieri"],
  ["Roberto", "Gatti"],
  ["Diego", "Fiore"],
  ["Massimo", "Bernardi"],
  ["Giulio", "Piras"],
] as const;

function buildPilotPlayers(
  names: readonly (readonly [string, string])[],
  idPrefix: string,
): readonly PlayerListItem[] {
  return names.map(([firstName, lastName], index) => {
    const number = index + 1;
    return {
      id: `${idPrefix}-${number}`,
      firstName,
      lastName,
      photoUrl: null,
      registrationId: null,
      season: null,
      warning: number === 7,
      suspended: number === 13,
      selected: false,
      shirtNumber: null,
      role: number <= 11 ? "starter" : "reserve",
      isGoalkeeper: number === 1 || number === 12,
      isCaptain: false,
      isViceCaptain: false,
    };
  });
}

export const pilotPlayers: readonly PlayerListItem[] = buildPilotPlayers(
  homePlayerNames,
  "pilot-player",
);

export const pilotStaff: readonly StaffListItem[] = [
  { id: "pilot-staff-1", fullName: "Mario Rossi", role: "Allenatore", photoUrl: null, registrationId: null, season: null, selected: false },
  { id: "pilot-staff-2", fullName: "Lucia Bianchi", role: "Medico", photoUrl: null, registrationId: null, season: null, selected: false },
  { id: "pilot-staff-3", fullName: "Paolo Verdi", role: "Dirigente accompagnatore", photoUrl: null, registrationId: null, season: null, selected: false },
];


export const pilotAwayPlayers: readonly PlayerListItem[] = buildPilotPlayers(
  awayPlayerNames,
  "pilot-away-player",
);

export const pilotAwayStaff: readonly StaffListItem[] = pilotStaff.map((staffMember, index) => ({
  ...staffMember,
  id: `pilot-away-staff-${index + 1}`,
  fullName: `${staffMember.fullName} Ospite`,
  selected: false,
}));
