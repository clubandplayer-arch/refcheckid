import { getApiBaseUrl } from "./api-base-url";
import { managerTeamConfig, getCurrentManagerTeam } from "./manager-team";
import { enrichPlayersWithBackendPhotos, enrichStaffWithBackendStatus } from "./manager-photo-backend";
import { pilotAwayPlayers, pilotAwayStaff, pilotPlayers, pilotStaff } from "./pilot-data";
import {
  isSessionExpired,
  readStoredSession,
  refreshStoredSession,
  writeStoredSession,
} from "./session";
import type { ManagerDashboard, PlayerListItem, StaffListItem } from "./types";

export interface ApiMatch {
  id: string;
  homeClubId: string;
  awayClubId: string;
  refereeId: string | null;
  scheduledAt: string;
  venue: string | null;
  status: string;
}

export interface ApiMatchSheet {
  id: string;
  matchId: string;
  clubId: string;
  submittedAt: string | null;
  status: "draft" | "submitted" | "locked";
}

export interface ApiReport {
  id: string;
  matchId: string;
  refereeId: string;
  submittedAt: string | null;
  status: string;
  summary: string | null;
}


export type ApiManifestPhotoStatus = "missing" | "pending" | "active" | "rejected" | "suspended";
export type ApiManifestSource = "live_manifest" | "frozen_snapshot";

export interface ApiMatchPhotoManifestSubject {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  teamName: string;
  roleLabel: string;
  subjectKind: "player" | "staff";
  photoUrl: string | null;
  photoStatus: ApiManifestPhotoStatus;
  photoEtag: string | null;
  manifestSource: ApiManifestSource;
  isFrozenSnapshot: boolean;
  document: {
    type: string;
    number: string;
    expiresAt: string;
  };
}

export interface ApiMatchPhotoManifest {
  matchId: string;
  manifestVersion: string;
  photoEtag: string;
  generatedAt: string;
  expiresAt: string | null;
  status: "available" | "expired" | "unavailable";
  subjects: readonly ApiMatchPhotoManifestSubject[];
}

export interface ApiPhoto {
  id: string;
  playerId?: string;
  status?: string;
  storagePath?: string;
}

export const queryKeys = {
  audit: ["audit"] as const,
  federation: ["federation"] as const,
  manager: ["manager"] as const,
  matches: ["matches"] as const,
  matchReports: ["matchReports"] as const,
  matchSheets: ["matchSheets"] as const,
  photos: ["photos"] as const,
  players: ["players"] as const,
  recognitions: ["recognitions"] as const,
  referees: ["referees"] as const,
  staff: ["staff"] as const,
};

export async function fetchManagerDashboard(): Promise<ManagerDashboard> {
  const managerTeam = getCurrentManagerTeam();
  const managerClubId = managerTeamConfig[managerTeam].clubId;
  const [matches, sheets] = await Promise.all([
    fetchMatches(`?clubId=${encodeURIComponent(managerClubId)}`),
    fetchMatchSheets(`?clubId=${encodeURIComponent(managerClubId)}`),
  ]);
  const nextMatch =
    [...matches].sort((a, b) =>
      a.scheduledAt.localeCompare(b.scheduledAt),
    )[0] ?? null;
  const firstSheet = nextMatch
    ? sheets.find((sheet) => sheet.matchId === nextMatch.id)
    : null;
  return {
    nextMatch: nextMatch
      ? {
          id: nextMatch.id,
          opponent: managerTeamConfig[managerTeam].opponent,
          scheduledAt: nextMatch.scheduledAt,
          venue: nextMatch.venue ?? "Da definire",
        }
      : null,
    matchSheetStatus: firstSheet?.status ?? "draft",
    notifications: firstSheet ? [toManagerStatusNotification(firstSheet.status)] : [],
  };
}

function toManagerStatusNotification(status: ApiMatchSheet["status"]): string {
  return {
    draft: "Distinta in bozza: completa i convocati e inviala",
    locked: "Distinta presa in carico dall’arbitro",
    submitted: "Distinta inviata: attendi l’arbitro",
  }[status];
}

export async function fetchPlayers(): Promise<readonly PlayerListItem[]> {
  const players = await request<readonly Record<string, unknown>[]>("/players");
  const managerTeam = getCurrentManagerTeam();
  const pilotRoster = managerTeam === "away" ? pilotAwayPlayers : pilotPlayers;
  const managerClubId = managerTeamConfig[managerTeam].clubId;
  const registrations = await fetchPlayerRegistrations(`?clubId=${encodeURIComponent(managerClubId)}`);
  const registrationByPlayerId = new Map(registrations.map((registration) => [registration.playerId, registration]));
  const mappedPlayers: readonly PlayerListItem[] = players.length === 0 ? pilotRoster : players.map((player) => {
    const registration = registrationByPlayerId.get(String(player.id));
    return {
    id: String(player.id),
    firstName: String(player.firstName ?? player.first_name ?? ""),
    lastName: String(player.lastName ?? player.last_name ?? ""),
    photoUrl: normalizePhotoUrl(player.photoUrl ?? player.photo_url),
    registrationId: registration?.id ?? null,
    season: registration?.season ?? null,
	    warning: Boolean(player.warning ?? false),
	    suspended: Boolean(player.suspended ?? false),
	    selected: false,
	    shirtNumber: null,
	    role: "starter" as const,
	    isGoalkeeper: false,
	    isCaptain: false,
	    isViceCaptain: false,
	  };
  });
  return enrichPlayersWithBackendPhotos(managerTeam, mappedPlayers);
}

export async function fetchStaff(): Promise<readonly StaffListItem[]> {
  const staff =
    await request<readonly Record<string, unknown>[]>("/staff-members");
  const managerTeam = getCurrentManagerTeam();
  const managerClubId = managerTeamConfig[managerTeam].clubId;
  const registrations = await fetchStaffRegistrations(`?clubId=${encodeURIComponent(managerClubId)}`);
  const registrationByStaffId = new Map(registrations.map((registration) => [registration.staffMemberId, registration]));
  const pilotRoster = managerTeam === "away" ? pilotAwayStaff : pilotStaff;
  const mappedStaff: readonly StaffListItem[] = staff.length === 0 ? pilotRoster : staff.map((staffMember) => {
    const registration = registrationByStaffId.get(String(staffMember.id));
    return {
      id: String(staffMember.id),
      fullName: String(
        staffMember.fullName ?? staffMember.full_name ?? staffMember.id,
      ),
      role: String(registration?.role ?? staffMember.role ?? "staff"),
      photoUrl: staffMember.photoUrl ? String(staffMember.photoUrl) : null,
      registrationId: registration?.id ?? null,
      season: registration?.season ?? null,
      selected: false,
    };
  });
  return enrichStaffWithBackendStatus(managerTeam, mappedStaff);
}

export interface ApiPlayerRegistration {
  id: string;
  playerId: string;
  clubId: string;
  season: string;
  status: string;
}

export function fetchPlayerRegistrations(query = ""): Promise<readonly ApiPlayerRegistration[]> {
  return request<readonly ApiPlayerRegistration[]>(`/player-registrations${query}`);
}

export interface ApiStaffRegistration {
  id: string;
  staffMemberId: string;
  clubId: string;
  season: string;
  role: string;
  status: string;
}

export function fetchStaffRegistrations(query = ""): Promise<readonly ApiStaffRegistration[]> {
  return request<readonly ApiStaffRegistration[]>(`/staff-registrations${query}`);
}

function normalizePhotoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value === "/placeholder-player.svg" ? null : value;
}

export function fetchMatches(query = ""): Promise<readonly ApiMatch[]> {
  return request<readonly ApiMatch[]>(`/matches${query}`);
}

export function fetchMatchSheets(
  query = "",
): Promise<readonly ApiMatchSheet[]> {
  return request<readonly ApiMatchSheet[]>(`/match-sheets${query}`);
}

export function resetSmokeMatchSheet(matchSheetId: string): Promise<ApiMatchSheet> {
  return request<ApiMatchSheet>(
    `/match-sheets/${encodeURIComponent(matchSheetId)}/reset-smoke`,
    { method: "POST" },
  );
}

export function fetchMatchReports(
  query = "",
): Promise<readonly ApiReport[] | ApiReport | null> {
  return request<readonly ApiReport[] | ApiReport | null>(
    `/match-reports${query}`,
  );
}

export function fetchPhotos(): Promise<readonly ApiPhoto[]> {
  return request<readonly ApiPhoto[]>("/photos");
}

export function fetchMatchPhotoManifest(matchId: string): Promise<ApiMatchPhotoManifest> {
  return request<ApiMatchPhotoManifest>(`/matches/${encodeURIComponent(matchId)}/photo-manifest`);
}

export function submitMatchSheet(matchSheetId: string): Promise<ApiMatchSheet> {
  return request<ApiMatchSheet>(
    `/match-sheets/${encodeURIComponent(matchSheetId)}/submit`,
    {
      method: "POST",
    },
  );
}

export function lockMatchSheet(matchSheetId: string): Promise<ApiMatchSheet> {
  return request<ApiMatchSheet>(
    `/match-sheets/${encodeURIComponent(matchSheetId)}/lock`,
    {
      method: "POST",
    },
  );
}

export function startRecognition(matchId: string) {
  return request("/recognitions/start", {
    method: "POST",
    body: JSON.stringify({ matchId }),
  });
}

export function completeRecognition(matchId: string) {
  return request("/recognitions/complete", {
    method: "POST",
    body: JSON.stringify({ matchId }),
  });
}

export function updateMatchReport(
  reportId: string,
  summary: string,
): Promise<ApiReport> {
  return request<ApiReport>(`/match-reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    body: JSON.stringify({ summary }),
  });
}

export function submitMatchReport(reportId: string): Promise<ApiReport> {
  return request<ApiReport>(
    `/match-reports/${encodeURIComponent(reportId)}/submit`,
    { method: "POST" },
  );
}

export async function request<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const activeSession = await resolveActiveSession();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(activeSession ? { authorization: `Bearer ${activeSession.accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}.`);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

async function resolveActiveSession() {
  const session = readStoredSession();
  if (session === null) return null;
  if (!isSessionExpired(session)) return session;

  const refreshedSession = await refreshStoredSession(session.refreshToken);
  if (refreshedSession === null) {
    window.localStorage.removeItem("refcheckid.session");
    return null;
  }

  writeStoredSession(refreshedSession);
  return refreshedSession;
}
