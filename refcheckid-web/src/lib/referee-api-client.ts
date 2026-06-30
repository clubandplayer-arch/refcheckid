import type {
  MatchReportDraft,
  RecognitionSubject,
  RefereeDashboard,
  TeamSheetVerification,
} from "./referee-types";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export async function fetchRefereeDashboard(
  refereeId: string,
): Promise<RefereeDashboard> {
  const matches = await request<readonly RefereeDashboard["nextMatch"][]>(
    `/matches?refereeId=${encodeURIComponent(refereeId)}`,
  );
  return {
    nextMatch: matches.find((match) => match !== null) ?? null,
    notifications: [],
  };
}

export async function fetchMatchSheets(
  matchId: string,
): Promise<readonly TeamSheetVerification[]> {
  return request<readonly TeamSheetVerification[]>(
    `/match-sheets?matchId=${encodeURIComponent(matchId)}`,
  );
}

export async function fetchRecognitionSubjects(
  matchId: string,
): Promise<readonly RecognitionSubject[]> {
  return request<readonly RecognitionSubject[]>(
    `/recognitions?matchId=${encodeURIComponent(matchId)}`,
  );
}

export async function submitRefereeReport(
  reportId: string,
  report: MatchReportDraft,
): Promise<void> {
  await request(`/match-reports/${encodeURIComponent(reportId)}/submit`, {
    method: "POST",
    body: JSON.stringify(report),
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
