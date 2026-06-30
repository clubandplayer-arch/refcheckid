import type {
  FederationDashboard,
  FederationHistoryItem,
  FederationMatchListItem,
  FederationReport,
  PhotoRequest,
} from "./federation-types";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export async function fetchFederationDashboard(): Promise<FederationDashboard> {
  return request<FederationDashboard>("/federations/dashboard");
}

export async function fetchFederationMatches(): Promise<
  readonly FederationMatchListItem[]
> {
  return request<readonly FederationMatchListItem[]>("/matches");
}

export async function fetchFederationReports(): Promise<
  readonly FederationReport[]
> {
  return request<readonly FederationReport[]>("/match-reports");
}

export async function fetchPhotoRequests(): Promise<readonly PhotoRequest[]> {
  return request<readonly PhotoRequest[]>("/photos");
}

export async function fetchFederationHistory(): Promise<
  readonly FederationHistoryItem[]
> {
  return request<readonly FederationHistoryItem[]>(
    "/audit/by-action?action=MATCH_ARCHIVED",
  );
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
