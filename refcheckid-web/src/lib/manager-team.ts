import { readStoredSession } from "./session";

export type ManagerTeam = "home" | "away";

export const managerTeamConfig = {
  home: {
    clubId: "70000000-0000-4000-8000-000000000003",
    label: "Casa",
    opponent: "Ospite",
  },
  away: {
    clubId: "70000000-0000-4000-8000-000000000004",
    label: "Ospite",
    opponent: "Casa",
  },
} as const;

export function getManagerTeamByEmail(email: string | undefined): ManagerTeam {
  return email?.toLowerCase() === "dirigenteospite@refcheckid.local" ? "away" : "home";
}

export function getCurrentManagerTeam(): ManagerTeam {
  return getManagerTeamByEmail(readStoredSession()?.user.email);
}
