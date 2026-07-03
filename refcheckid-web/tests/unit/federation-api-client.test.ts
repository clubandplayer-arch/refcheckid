import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchFederationDashboard,
  fetchFederationHistory,
  fetchFederationMatches,
  fetchFederationReports,
} from "../../src/lib/federation-api-client";

vi.mock("../../src/lib/api-client", () => ({
  fetchMatchReports: vi.fn(),
  fetchMatches: vi.fn(),
  fetchPhotos: vi.fn(),
  request: vi.fn(),
}));

vi.mock("../../src/lib/submitted-report", () => ({
  readSubmittedFederationReports: vi.fn(),
}));

import {
  fetchMatchReports,
  fetchMatches,
  fetchPhotos,
  request,
} from "../../src/lib/api-client";
import { readSubmittedFederationReports } from "../../src/lib/submitted-report";

const match = {
  awayClubId: "Ospite Demo",
  homeClubId: "Casa Demo",
  id: "match-1",
  refereeId: "Arbitro Demo",
  scheduledAt: "2026-07-01T18:00:00.000Z",
  status: "scheduled",
  venue: "QA Stadium",
};

const submittedReport = {
  awayTeam: "Ospite Demo",
  cautions: [
    {
      detail: "Fallo",
      id: "c1",
      minute: 30,
      playerName: "Bianchi",
      teamName: "Ospite",
    },
  ],
  expulsions: [],
  goals: [
    {
      detail: "Azione",
      id: "g1",
      minute: 12,
      playerName: "Rossi",
      teamName: "Casa",
    },
  ],
  homeTeam: "Casa Demo",
  id: "report-1",
  matchId: "match-1",
  refereeName: "Arbitro Demo",
  refereeNotes: "Nessuna nota",
  result: { awayGoals: 0, homeGoals: 1 },
  status: "submitted" as const,
  substitutions: [],
  submittedAt: "2026-07-01T20:00:00.000Z",
};

describe("regression: federation report reception", () => {
  beforeEach(() => {
    vi.mocked(fetchMatches).mockResolvedValue([match]);
    vi.mocked(fetchPhotos).mockResolvedValue([]);
    vi.mocked(fetchMatchReports).mockResolvedValue({
      id: "backend-report-1",
      matchId: "match-1",
      refereeId: "Arbitro Demo",
      status: "draft",
      submittedAt: null,
      summary: null,
    });
    vi.mocked(request).mockResolvedValue([]);
    vi.mocked(readSubmittedFederationReports).mockReturnValue([
      submittedReport,
    ]);
  });

  it("does not call the match-reports collection without matchId", async () => {
    await fetchFederationReports();

    expect(fetchMatchReports).toHaveBeenCalledWith("?matchId=match-1");
    expect(fetchMatchReports).not.toHaveBeenCalledWith();
  });

  it("marks the calendar report as submitted after referee submission", async () => {
    const matches = await fetchFederationMatches();

    expect(matches[0]).toMatchObject({
      id: "match-1",
      reportStatus: "submitted",
    });
  });

  it("maps known club identifiers to team names in the federation calendar", async () => {
    vi.mocked(fetchMatches).mockResolvedValue([
      {
        ...match,
        awayClubId: "70000000-0000-4000-8000-000000000004",
        homeClubId: "70000000-0000-4000-8000-000000000003",
      },
    ]);

    const matches = await fetchFederationMatches();

    expect(matches[0]).toMatchObject({
      awayTeam: "Sporting Litorale",
      homeTeam: "Atletico Aurora",
    });
  });

  it("maps known club identifiers to team names in reports and history", async () => {
    vi.mocked(fetchMatches).mockResolvedValue([
      {
        ...match,
        awayClubId: "70000000-0000-4000-8000-000000000004",
        homeClubId: "70000000-0000-4000-8000-000000000003",
      },
    ]);
    vi.mocked(readSubmittedFederationReports).mockReturnValue([
      {
        ...submittedReport,
        awayTeam: "Ospite",
        homeTeam: "Casa",
      },
    ]);

    const [reports, history] = await Promise.all([
      fetchFederationReports(),
      fetchFederationHistory(),
    ]);

    expect(reports[0]).toMatchObject({
      awayTeam: "Sporting Litorale",
      homeTeam: "Atletico Aurora",
    });
    expect(history[0]).toMatchObject({
      clubNames: ["Atletico Aurora", "Sporting Litorale"],
      matchLabel: "Atletico Aurora - Sporting Litorale",
    });
  });

  it("shows the submitted report in dashboard, reports and history", async () => {
    const [dashboard, reports, history] = await Promise.all([
      fetchFederationDashboard(),
      fetchFederationReports(),
      fetchFederationHistory(),
    ]);

    expect(dashboard.reportsReceived).toBe(1);
    expect(dashboard.matchesPending).toBe(0);
    expect(reports[0]).toMatchObject({
      id: "report-1",
      result: { homeGoals: 1, awayGoals: 0 },
      goals: [{ playerName: "Rossi" }],
      cautions: [{ playerName: "Bianchi" }],
    });
    expect(history[0]).toMatchObject({
      matchLabel: "Casa Demo - Ospite Demo",
      reportId: "report-1",
    });
  });

  it("shows a backend-submitted report when local browser storage is empty", async () => {
    vi.mocked(readSubmittedFederationReports).mockReturnValue([]);
    vi.mocked(fetchMatchReports).mockResolvedValue({
      id: "backend-report-1",
      matchId: "match-1",
      refereeId: "Arbitro Demo",
      status: "submitted",
      submittedAt: "2026-07-01T20:00:00.000Z",
      summary: JSON.stringify(submittedReport),
    });

    const [dashboard, reports, matches] = await Promise.all([
      fetchFederationDashboard(),
      fetchFederationReports(),
      fetchFederationMatches(),
    ]);

    expect(dashboard.reportsReceived).toBe(1);
    expect(matches[0]?.reportStatus).toBe("submitted");
    expect(reports[0]).toMatchObject({
      goals: [{ playerName: "Rossi" }],
      result: { homeGoals: 1, awayGoals: 0 },
    });
  });
});
