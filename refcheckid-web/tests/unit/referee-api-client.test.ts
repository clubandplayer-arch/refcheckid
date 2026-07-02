import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRecognitionSubjects,
  fetchRefereeMatchSheets,
  fetchRefereeReport,
  lockSubmittedSheetsAndStartRecognition,
} from "../../src/lib/referee-api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit: referee workflow API client", () => {
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
            clubId: "club-home",
            submittedAt: "2026-07-01T10:00:00.000Z",
            status: "submitted",
          },
          {
            id: "sheet-away",
            matchId: "match-1",
            clubId: "club-away",
            submittedAt: null,
            status: "draft",
          },
        ],
      })),
    );

    await expect(fetchRefereeMatchSheets("match-1")).resolves.toEqual([
      expect.objectContaining({
        clubName: "Casa · club-home",
        status: "submitted",
        team: "home",
      }),
      expect.objectContaining({
        clubName: "Ospite · club-away",
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
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/match-sheets/sheet-away/lock"),
      expect.objectContaining({ method: "POST" }),
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


  it("recognizes only submitted sheet players and staff from the saved match sheet", async () => {
    const snapshot = {
      players: Array.from({ length: 14 }, (_, index) => ({
        firstName: `Nome${index + 1}`,
        id: `player-${index + 1}`,
        lastName: `Giocatore${index + 1}`,
        photoUrl: "/placeholder-player.svg",
        roleLabel: index === 0 ? "Portiere" : "Titolare",
        shirtNumber: index + 1,
        subjectKind: "player",
        teamName: "Casa",
      })),
      staff: Array.from({ length: 3 }, (_, index) => ({
        firstName: `Staff${index + 1}`,
        id: `staff-${index + 1}`,
        lastName: "Demo",
        photoUrl: "/placeholder-player.svg",
        roleLabel: "Allenatore",
        shirtNumber: null,
        subjectKind: "staff",
        teamName: "Casa",
      })),
    };
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) =>
          key === "refcheckid.submittedMatchSheet"
            ? JSON.stringify(snapshot)
            : null,
      },
    });

    const subjects = await fetchRecognitionSubjects();

    expect(subjects).toHaveLength(17);
    expect(subjects.filter((subject) => subject.subjectKind === "player")).toHaveLength(14);
    expect(subjects.filter((subject) => subject.subjectKind === "staff")).toHaveLength(3);
    expect(subjects[14]).toMatchObject({
      roleLabel: "Allenatore",
      shirtNumber: null,
      subjectKind: "staff",
    });
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
});
