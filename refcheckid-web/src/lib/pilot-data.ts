import type { PlayerListItem, StaffListItem } from "./types";

export const pilotPlayers: readonly PlayerListItem[] = Array.from(
  { length: 18 },
  (_, index) => {
    const number = index + 1;
    return {
      id: `pilot-player-${number}`,
      firstName: `Nome${number}`,
      lastName: `Giocatore${String(number).padStart(2, "0")}`,
      photoUrl: "/placeholder-player.svg",
      warning: number === 7,
      suspended: number === 13,
      selected: false,
      shirtNumber: null,
      role: number <= 11 ? "starter" : "reserve",
      isCaptain: false,
      isViceCaptain: false,
    };
  },
);

export const pilotStaff: readonly StaffListItem[] = [
  { id: "pilot-staff-1", fullName: "Mario Rossi", role: "Allenatore", photoUrl: null, selected: false },
  { id: "pilot-staff-2", fullName: "Lucia Bianchi", role: "Medico", photoUrl: null, selected: false },
  { id: "pilot-staff-3", fullName: "Paolo Verdi", role: "Dirigente accompagnatore", photoUrl: null, selected: false },
];


export const pilotAwayPlayers: readonly PlayerListItem[] = pilotPlayers.map((player, index) => ({
  ...player,
  id: `pilot-away-player-${index + 1}`,
  firstName: `OspiteNome${index + 1}`,
  lastName: `Ospite${String(index + 1).padStart(2, "0")}`,
  selected: false,
  shirtNumber: null,
}));

export const pilotAwayStaff: readonly StaffListItem[] = pilotStaff.map((staffMember, index) => ({
  ...staffMember,
  id: `pilot-away-staff-${index + 1}`,
  fullName: `${staffMember.fullName} Ospite`,
  selected: false,
}));
