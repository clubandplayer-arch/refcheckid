import type { ManagerDashboard, PlayerListItem, StaffListItem } from "./types";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export async function fetchManagerDashboard(): Promise<ManagerDashboard> {
  return request<ManagerDashboard>("/manager/dashboard");
}

export async function fetchPlayers(): Promise<readonly PlayerListItem[]> {
  return request<readonly PlayerListItem[]>("/players");
}

export async function fetchStaff(): Promise<readonly StaffListItem[]> {
  return request<readonly StaffListItem[]>("/staff-members");
}

export async function submitMatchSheet(payload: unknown): Promise<void> {
  await request("/match-sheets/current/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function request<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}.`);
  }

  return (await response.json()) as TResponse;
}
