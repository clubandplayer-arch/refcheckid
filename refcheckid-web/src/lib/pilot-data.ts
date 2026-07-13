import arch1DemoManifest from "../../../refcheckid-backend/demo/arch1-demo-manifest.json";
import type { PlayerLineupRole, PlayerListItem, StaffListItem } from "./types";

type DemoSide = "home" | "away";

type DemoPlayer = (typeof arch1DemoManifest.players)[number];
type DemoStaffMember = (typeof arch1DemoManifest.staffMembers)[number];

function mapDemoPlayer(player: DemoPlayer): PlayerListItem {
  const registration = arch1DemoManifest.playerRegistrations.find(
    (candidate) => candidate.playerId === player.id,
  );

  return {
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    photoUrl: null,
    registrationId: registration?.id ?? null,
    season: registration?.season ?? arch1DemoManifest.seasonId,
    warning: player.warning,
    suspended: player.suspended,
    selected: false,
    shirtNumber: null,
    role: player.role as PlayerLineupRole,
    isGoalkeeper: player.isGoalkeeper,
    isCaptain: player.isCaptain,
    isViceCaptain: player.isViceCaptain,
  };
}

function mapDemoStaffMember(staffMember: DemoStaffMember): StaffListItem {
  const registration = arch1DemoManifest.staffRegistrations.find(
    (candidate) => candidate.staffMemberId === staffMember.id,
  );

  return {
    id: staffMember.id,
    fullName: staffMember.fullName,
    role: staffMember.role,
    photoUrl: null,
    registrationId: registration?.id ?? null,
    season: registration?.season ?? arch1DemoManifest.seasonId,
    selected: false,
  };
}

function demoPlayersForSide(side: DemoSide): readonly PlayerListItem[] {
  return arch1DemoManifest.players.filter((player) => player.side === side).map(mapDemoPlayer);
}

function demoStaffForSide(side: DemoSide): readonly StaffListItem[] {
  return arch1DemoManifest.staffMembers.filter((staffMember) => staffMember.side === side).map(mapDemoStaffMember);
}

export const pilotPlayers: readonly PlayerListItem[] = demoPlayersForSide("home");
export const pilotAwayPlayers: readonly PlayerListItem[] = demoPlayersForSide("away");
export const pilotStaff: readonly StaffListItem[] = demoStaffForSide("home");
export const pilotAwayStaff: readonly StaffListItem[] = demoStaffForSide("away");
