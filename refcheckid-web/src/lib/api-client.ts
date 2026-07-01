import { getApiBaseUrl } from "./api-base-url";
import { pilotPlayers, pilotStaff } from "./pilot-data";
import { isSessionExpired, readStoredSession } from "./session";
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
  const [matches, sheets] = await Promise.all([
    fetchMatches(),
    fetchMatchSheets(),
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
          opponent: nextMatch.awayClubId,
          scheduledAt: nextMatch.scheduledAt,
          venue: nextMatch.venue ?? "Da definire",
        }
      : null,
    matchSheetStatus: firstSheet?.status ?? "draft",
    notifications: firstSheet ? [`Distinta ${firstSheet.status}`] : [],
  };
}

export async function fetchPlayers(): Promise<readonly PlayerListItem[]> {
  const players = await request<readonly Record<string, unknown>[]>("/players");
  if (players.length === 0) return pilotPlayers;
  return players.map((player) => ({
    id: String(player.id),
    firstName: String(player.firstName ?? player.first_name ?? ""),
    lastName: String(player.lastName ?? player.last_name ?? ""),
    photoUrl: String(player.photoUrl ?? player.photo_url ?? "/placeholder-player.svg"),
    warning: Boolean(player.warning ?? false),
    suspended: Boolean(player.suspended ?? false),
    selected: false,
    shirtNumber: null,
    role: "player",
  }));
}

export async function fetchStaff(): Promise<readonly StaffListItem[]> {
  const staff =
    await request<readonly Record<string, unknown>[]>("/staff-members");
  if (staff.length === 0) return pilotStaff;
  return staff.map((staffMember) => ({
    id: String(staffMember.id),
    fullName: String(
      staffMember.fullName ?? staffMember.full_name ?? staffMember.id,
    ),
    role: String(staffMember.role ?? "staff"),
    selected: false,
  }));
}

export function fetchMatches(query = ""): Promise<readonly ApiMatch[]> {
  return request<readonly ApiMatch[]>(`/matches${query}`);
}

export function fetchMatchSheets(
  query = "",
): Promise<readonly ApiMatchSheet[]> {
  return request<readonly ApiMatchSheet[]>(`/match-sheets${query}`);
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
  const session = readStoredSession();
  if (session && isSessionExpired(session)) {
    window.localStorage.removeItem("refcheckid.session");
  }
  const activeSession = session && !isSessionExpired(session) ? session : null;
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
