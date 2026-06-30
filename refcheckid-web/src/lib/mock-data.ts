import type { ManagerDashboard, PlayerListItem, StaffListItem } from "./types";

export const managerDashboard: ManagerDashboard = {
  nextMatch: {
    id: "match-1",
    opponent: "ASD Esempio",
    scheduledAt: "2026-07-04T18:00:00.000Z",
    venue: "Campo Comunale",
  },
  matchSheetStatus: "draft",
  notifications: ["3 giocatori senza numero maglia", "1 documento in scadenza"],
};

export const players: readonly PlayerListItem[] = [
  {
    id: "p1",
    firstName: "Luca",
    lastName: "Bianchi",
    photoUrl: null,
    warning: false,
    suspended: false,
    selected: true,
    shirtNumber: 1,
    role: "goalkeeper",
  },
  {
    id: "p2",
    firstName: "Marco",
    lastName: "Rossi",
    photoUrl: null,
    warning: true,
    suspended: false,
    selected: true,
    shirtNumber: 10,
    role: "captain",
  },
  {
    id: "p3",
    firstName: "Andrea",
    lastName: "Verdi",
    photoUrl: null,
    warning: false,
    suspended: true,
    selected: false,
    shirtNumber: null,
    role: "player",
  },
  {
    id: "p4",
    firstName: "Paolo",
    lastName: "Neri",
    photoUrl: null,
    warning: false,
    suspended: false,
    selected: true,
    shirtNumber: 7,
    role: "vice_captain",
  },
];

export const staff: readonly StaffListItem[] = [
  {
    id: "s1",
    fullName: "Giulia Conti",
    role: "Dirigente accompagnatore",
    selected: true,
  },
  { id: "s2", fullName: "Franco Costa", role: "Allenatore", selected: true },
  { id: "s3", fullName: "Sara Ferri", role: "Medico", selected: false },
];
