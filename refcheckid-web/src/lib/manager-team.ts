import { readStoredSession } from "./session";

export type ManagerTeam = "home" | "away";

export const managerTeamConfig = {
  home: {
    clubId: "70000000-0000-4000-8000-000000000003",
    federationId: "70000000-0000-4000-8000-000000000002",
    label: "Atletico Aurora",
    opponent: "Sporting Litorale",
  },
  away: {
    clubId: "70000000-0000-4000-8000-000000000004",
    federationId: "70000000-0000-4000-8000-000000000002",
    label: "Sporting Litorale",
    opponent: "Atletico Aurora",
  },
} as const;

export function getManagerTeamByEmail(email: string | undefined): ManagerTeam {
  return email?.toLowerCase() === "dirigenteospite@refcheckid.local" ? "away" : "home";
}

export function getCurrentManagerTeam(): ManagerTeam {
  return getManagerTeamByEmail(readStoredSession()?.user.email);
}
