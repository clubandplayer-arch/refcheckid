import type { PlayerListItem, StaffListItem } from "./types";

const submittedMatchSheetKey = "refcheckid.submittedMatchSheet";

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
}): void {
  if (typeof window === "undefined") return;
  const snapshot: SubmittedMatchSheetSnapshot = {
    players: input.players.map((player) => ({
      firstName: player.firstName,
      id: player.id,
      lastName: player.lastName,
      photoUrl: player.photoUrl,
      roleLabel: toLineupRoleLabel(player.role),
      shirtNumber: player.shirtNumber,
      subjectKind: "player",
      teamName: "Casa",
    })),
    staff: input.staff.map((staffMember) => {
      const [firstName, ...lastNameParts] = staffMember.fullName.split(" ");
      return {
        firstName: firstName ?? staffMember.fullName,
        id: staffMember.id,
        lastName: lastNameParts.join(" ") || staffMember.role,
        photoUrl: "/placeholder-player.svg",
        roleLabel: staffMember.role,
        shirtNumber: null,
        subjectKind: "staff",
        teamName: "Casa",
      };
    }),
  };
  window.localStorage.setItem(submittedMatchSheetKey, JSON.stringify(snapshot));
}

export function readSubmittedMatchSheetSnapshot(): SubmittedMatchSheetSnapshot | null {
  if (typeof window === "undefined") return null;
  const rawSnapshot = window.localStorage.getItem(submittedMatchSheetKey);
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
        roleLabel: toLineupRoleLabel(player.role),
        shirtNumber: player.shirtNumber ?? index + 1,
        subjectKind: "player",
        teamName: "Casa",
      })),
    staff: input.staff.slice(0, 3).map((staffMember) => {
      const [firstName, ...lastNameParts] = staffMember.fullName.split(" ");
      return {
        firstName: firstName ?? staffMember.fullName,
        id: staffMember.id,
        lastName: lastNameParts.join(" ") || staffMember.role,
        photoUrl: "/placeholder-player.svg",
        roleLabel: staffMember.role,
        shirtNumber: null,
        subjectKind: "staff",
        teamName: "Casa",
      };
    }),
  };
}

function toLineupRoleLabel(role: PlayerListItem["role"]): string {
  if (role === "goalkeeper") return "Portiere";
  if (role === "starter") return "Titolare";
  return "Riserva";
}
