import { managerTeamConfig, type ManagerTeam } from "./manager-team";
import type { PlayerListItem, StaffListItem } from "./types";

const submittedMatchSheetKeyPrefix = "refcheckid.submittedMatchSheet";

export interface SubmittedRecognitionSubject {
  id: string;
  firstName: string;
  lastName: string;
  roleLabel: string;
  teamName: string;
  photoUrl: string | null;
  shirtNumber: number | null;
  subjectKind: "player" | "staff";
}

export interface SubmittedMatchSheetSnapshot {
  players: readonly SubmittedRecognitionSubject[];
  staff: readonly SubmittedRecognitionSubject[];
}

export function saveSubmittedMatchSheetSnapshot(input: {
  players: readonly PlayerListItem[];
  staff: readonly StaffListItem[];
  team?: ManagerTeam;
}): void {
  if (typeof window === "undefined") return;
  const snapshot: SubmittedMatchSheetSnapshot = {
    players: input.players.map((player) => ({
      firstName: player.firstName,
      id: player.id,
      lastName: player.lastName,
      photoUrl: player.photoUrl,
      roleLabel: toLineupRoleLabel(player.role, player.isGoalkeeper),
      shirtNumber: player.shirtNumber,
      subjectKind: "player",
      teamName: managerTeamConfig[input.team ?? "home"].label,
    })),
    staff: input.staff.map((staffMember) => {
      const [firstName, ...lastNameParts] = staffMember.fullName.split(" ");
      return {
        firstName: firstName ?? staffMember.fullName,
        id: staffMember.id,
        lastName: lastNameParts.join(" ") || staffMember.role,
        photoUrl: staffMember.photoUrl,
        roleLabel: staffMember.role,
        shirtNumber: null,
        subjectKind: "staff",
        teamName: managerTeamConfig[input.team ?? "home"].label,
      };
    }),
  };
  window.localStorage.setItem(getSubmittedMatchSheetKey(input.team ?? "home"), JSON.stringify(snapshot));
}

export function readSubmittedMatchSheetSnapshot(team: ManagerTeam = "home"): SubmittedMatchSheetSnapshot | null {
  if (typeof window === "undefined") return null;
  const rawSnapshot = window.localStorage.getItem(getSubmittedMatchSheetKey(team));
  if (!rawSnapshot) return null;
  try {
    const parsed = JSON.parse(rawSnapshot) as SubmittedMatchSheetSnapshot;
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
      staff: Array.isArray(parsed.staff) ? parsed.staff : [],
    };
  } catch {
    return null;
  }
}

export function buildPilotSubmittedMatchSheetSnapshot(input: {
  players: readonly PlayerListItem[];
  staff: readonly StaffListItem[];
}): SubmittedMatchSheetSnapshot {
  return {
    players: input.players
      .filter((player) => !player.suspended)
      .slice(0, 14)
      .map((player, index) => ({
        firstName: player.firstName,
        id: player.id,
        lastName: player.lastName,
        photoUrl: player.photoUrl,
        roleLabel: toLineupRoleLabel(player.role, player.isGoalkeeper),
        shirtNumber: player.shirtNumber ?? index + 1,
        subjectKind: "player",
        teamName: managerTeamConfig.home.label,
      })),
    staff: input.staff.slice(0, 3).map((staffMember) => {
      const [firstName, ...lastNameParts] = staffMember.fullName.split(" ");
      return {
        firstName: firstName ?? staffMember.fullName,
        id: staffMember.id,
        lastName: lastNameParts.join(" ") || staffMember.role,
        photoUrl: staffMember.photoUrl,
        roleLabel: staffMember.role,
        shirtNumber: null,
        subjectKind: "staff",
        teamName: managerTeamConfig.home.label,
      };
    }),
  };
}

export function buildPilotAwaySubmittedMatchSheetSnapshot(input: {
  players: readonly PlayerListItem[];
  staff: readonly StaffListItem[];
}): SubmittedMatchSheetSnapshot {
  return {
    players: input.players
      .filter((player) => !player.suspended)
      .slice(0, 11)
      .map((player, index) => ({
        firstName: player.firstName,
        id: `away-${player.id}`,
        lastName: player.lastName,
        photoUrl: player.photoUrl,
        roleLabel: toLineupRoleLabel(player.role, player.isGoalkeeper),
        shirtNumber: player.shirtNumber ?? index + 1,
        subjectKind: "player",
        teamName: managerTeamConfig.away.label,
      })),
    staff: input.staff.slice(0, 2).map((staffMember) => {
      const [firstName, ...lastNameParts] = staffMember.fullName.split(" ");
      return {
        firstName: firstName ?? staffMember.fullName,
        id: `away-${staffMember.id}`,
        lastName: lastNameParts.join(" ") || staffMember.role,
        photoUrl: staffMember.photoUrl,
        roleLabel: staffMember.role,
        shirtNumber: null,
        subjectKind: "staff",
        teamName: managerTeamConfig.away.label,
      };
    }),
  };
}

function toLineupRoleLabel(role: PlayerListItem["role"], isGoalkeeper: boolean): string {
  const lineupRole = role === "starter" ? "Titolare" : "Riserva";
  return isGoalkeeper ? `${lineupRole} · Portiere` : lineupRole;
}


export function clearSubmittedMatchSheetSnapshot(team: ManagerTeam): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getSubmittedMatchSheetKey(team));
}

function getSubmittedMatchSheetKey(team: ManagerTeam): string {
  return `${submittedMatchSheetKeyPrefix}.${team}`;
}
