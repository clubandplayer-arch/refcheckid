import type { PlayerListItem, StaffListItem } from "./types";

export const pilotPlayers: readonly PlayerListItem[] = Array.from({ length: 18 }, (_, index) => {
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
    role: number === 1 ? "goalkeeper" : number === 2 ? "captain" : "player",
  };
});

export const pilotStaff: readonly StaffListItem[] = [
  { id: "pilot-staff-1", fullName: "Mario Rossi", role: "Allenatore", selected: false },
  { id: "pilot-staff-2", fullName: "Lucia Bianchi", role: "Medico", selected: false },
  { id: "pilot-staff-3", fullName: "Paolo Verdi", role: "Dirigente accompagnatore", selected: false },
];
