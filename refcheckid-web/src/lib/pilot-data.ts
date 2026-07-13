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
  subjectUuidPrefix: string,
  registrationUuidPrefix: string,
): readonly PlayerListItem[] {
  return names.map(([firstName, lastName], index) => {
    const number = index + 1;
    return {
      id: buildPilotUuid(subjectUuidPrefix, number),
      firstName,
      lastName,
      photoUrl: null,
      registrationId: buildPilotUuid(registrationUuidPrefix, number),
      season: "2026",
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
  "71000000",
  "72000000",
);

export const pilotStaff: readonly StaffListItem[] = [
  { id: buildPilotUuid("73000000", 1), fullName: "Mario Rossi", role: "Allenatore", photoUrl: null, registrationId: buildPilotUuid("74000000", 1), season: "2026", selected: false },
  { id: buildPilotUuid("73000000", 2), fullName: "Lucia Bianchi", role: "Medico", photoUrl: null, registrationId: buildPilotUuid("74000000", 2), season: "2026", selected: false },
  { id: buildPilotUuid("73000000", 3), fullName: "Paolo Verdi", role: "Dirigente accompagnatore", photoUrl: null, registrationId: buildPilotUuid("74000000", 3), season: "2026", selected: false },
];


export const pilotAwayPlayers: readonly PlayerListItem[] = buildPilotPlayers(
  awayPlayerNames,
  "75000000",
  "76000000",
);

export const pilotAwayStaff: readonly StaffListItem[] = pilotStaff.map((staffMember, index) => ({
  ...staffMember,
  id: buildPilotUuid("77000000", index + 1),
  registrationId: buildPilotUuid("78000000", index + 1),
  fullName: `${staffMember.fullName} Ospite`,
  selected: false,
}));

function buildPilotUuid(prefix: string, number: number): string {
  return `${prefix}-0000-4000-8000-${String(number).padStart(12, "0")}`;
}
