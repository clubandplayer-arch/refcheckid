import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRecognitionSubjects,
  fetchRefereeDashboard,
  fetchRefereeMatchSheets,
  fetchRefereeReport,
  lockSubmittedSheetsAndStartRecognition,
  submitRefereeReport,
} from "../../src/lib/referee-api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit: referee workflow API client", () => {
  it("maps referee dashboard club ids to team names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "match-1",
            homeClubId: "70000000-0000-4000-8000-000000000003",
            awayClubId: "70000000-0000-4000-8000-000000000004",
            refereeId: "referee-1",
            scheduledAt: "2026-07-01T18:00:00.000Z",
            venue: "ARCH-1 Demo Stadium",
            status: "scheduled",
          },
        ],
      })),
    );

    await expect(fetchRefereeDashboard()).resolves.toMatchObject({
      nextMatch: {
        awayTeam: "Sporting Litorale",
        homeTeam: "Atletico Aurora",
      },
    });
  });

  it("labels home and away sheets clearly with status details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "sheet-home",
            matchId: "match-1",
            clubId: "70000000-0000-4000-8000-000000000003",
            submittedAt: "2026-07-01T10:00:00.000Z",
            status: "submitted",
            playerCount: 18,
            staffCount: 4,
          },
          {
            id: "sheet-away",
            matchId: "match-1",
            clubId: "70000000-0000-4000-8000-000000000004",
            submittedAt: null,
            status: "draft",
          },
        ],
      })),
    );

    await expect(fetchRefereeMatchSheets("match-1")).resolves.toEqual([
      expect.objectContaining({
        clubName: "Atletico Aurora",
        playerCount: 18,
        staffCount: 4,
        status: "submitted",
        team: "home",
      }),
      expect.objectContaining({
        clubName: "Sporting Litorale",
        playerCount: 0,
        staffCount: 0,
        status: "missing",
        team: "away",
      }),
    ]);
  });

  it("locks every unlocked sheet before starting recognition", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/match-sheets?")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: "sheet-home", status: "submitted" },
            { id: "sheet-away", status: "draft" },
            { id: "sheet-locked", status: "locked" },
          ],
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "in_progress" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      lockSubmittedSheetsAndStartRecognition("match-1"),
    ).resolves.toMatchObject({ status: "in_progress" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/match-sheets/sheet-home/lock"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/match-sheets/sheet-away/lock"),
      expect.anything(),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/match-sheets/sheet-locked/lock"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/recognitions/start"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not synthesize recognition subjects from local snapshots or pilot data", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRecognitionSubjects()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the report id so report submission uses the report resource", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: "report-1",
          matchId: "match-1",
          refereeId: "referee-1",
          status: "draft",
          summary: "Note arbitro",
        }),
      })),
    );

    await expect(fetchRefereeReport("match-1")).resolves.toMatchObject({
      id: "report-1",
      refereeNotes: "Note arbitro",
    });
  });

  it("persists report content before submitting the report", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "report-1",
        matchId: "match-1",
        refereeId: "Arbitro Demo",
        status: "submitted",
        submittedAt: "2026-07-01T20:00:00.000Z",
        summary: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await submitRefereeReport("match-1", {
      awayGoals: 0,
      cautions: [],
      expulsions: [],
      goals: [
        {
          detail: "Azione",
          id: "goal-1",
          minute: 12,
          playerName: "Rossi",
          teamName: "Atletico Aurora",
        },
      ],
      homeGoals: 1,
      id: "report-1",
      refereeNotes: "Note arbitro",
      status: "draft",
      substitutions: [],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/match-reports/report-1"),
      expect.objectContaining({
        body: expect.stringContaining("Rossi"),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/match-reports/report-1/submit"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("unit: referee manifest client", () => {
  it("loads recognition subjects exclusively from the match photo manifest", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        matchId: "match-1",
        manifestVersion: "frozen-v1",
        photoEtag: "etag-a",
        generatedAt: "2026-07-10T00:00:00.000Z",
        expiresAt: null,
        status: "available",
        subjects: [
          {
            id: "registration-1",
            firstName: "Ada",
            lastName: "Rossi",
            shirtNumber: 10,
            teamName: "Atletico Aurora",
            roleLabel: "Titolare",
            subjectKind: "player",
            photoUrl: "https://photos.local/ada.webp",
            photoStatus: "active",
            photoEtag: "photo-etag-a",
            manifestSource: "frozen_snapshot",
            isFrozenSnapshot: true,
            document: {
              type: "Documento atleta",
              number: "registration-1",
              expiresAt: "2027-01-01",
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRecognitionSubjects("match-1")).resolves.toEqual([
      expect.objectContaining({
        decision: "pending",
        id: "registration-1",
        isFrozenSnapshot: true,
        photoEtag: "photo-etag-a",
        photoStatus: "active",
        photoUrl: "https://photos.local/ada.webp",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/matches/match-1/photo-manifest"),
      expect.anything(),
    );
  });

  it("does not expose local file signed photo URLs in recognition subjects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          matchId: "match-1",
          manifestVersion: "frozen-v1",
          photoEtag: "etag-a",
          generatedAt: "2026-07-10T00:00:00.000Z",
          expiresAt: null,
          status: "available",
          subjects: [
            {
              id: "registration-1",
              firstName: "Ada",
              lastName: "Rossi",
              shirtNumber: 10,
              teamName: "70000000-0000-4000-8000-000000000003",
              roleLabel: "Titolare",
              subjectKind: "player",
              photoUrl: "file:///workspaces/refcheckid/photo.png",
              photoStatus: "active",
              photoEtag: "photo-etag-a",
              manifestSource: "frozen_snapshot",
              isFrozenSnapshot: true,
              document: {
                type: "Documento atleta",
                number: "registration-1",
                expiresAt: "2027-01-01",
              },
            },
          ],
        }),
      })),
    );

    await expect(fetchRecognitionSubjects("match-1")).resolves.toEqual([
      expect.objectContaining({
        photoUrl: null,
        teamName: "Atletico Aurora",
      }),
    ]);
  });
});

describe("unit: referee manifest cache guards", () => {
  it("does not activate legacy fallback when referee manifest is enabled but unavailable", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        matchId: "match-1",
        manifestVersion: "live-v1",
        photoEtag: "etag-empty",
        generatedAt: "2026-07-10T00:00:00.000Z",
        expiresAt: null,
        status: "unavailable",
        subjects: [],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () =>
          JSON.stringify({ players: [{ id: "legacy-player" }], staff: [] }),
      },
    });

    await expect(fetchRecognitionSubjects("match-1")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/matches/match-1/photo-manifest"),
      expect.anything(),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/match-sheets"),
      expect.anything(),
    );
  });
});
