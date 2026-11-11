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
  const user = readStoredSession()?.user;
  return user?.clubIds?.includes(managerTeamConfig.away.clubId) ? 'away' : getManagerTeamByEmail(user?.email);
}

export function getCurrentManagerConfig() {
  const user = readStoredSession()?.user;
  const demo = managerTeamConfig[getCurrentManagerTeam()];
  const clubId = user?.clubIds?.[0] ?? (process.env.NODE_ENV === 'production' ? '' : demo.clubId);
  return { clubId, federationId: user?.clubFederationIds?.[clubId] ?? user?.federationIds?.[0] ?? (process.env.NODE_ENV === 'production' ? '' : demo.federationId),
    label: clubId === demo.clubId ? demo.label : 'La tua società', opponent: clubId === demo.clubId ? demo.opponent : 'Avversario' };
}
