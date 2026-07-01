import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchManagerDashboard, request, submitMatchSheet } from "../../src/lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit: frontend API client", () => {
  it("maps API failures to rejected client promises", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403 })));
    await expect(request("/secure-resource")).rejects.toThrow("403");
  });

  it("builds the manager dashboard from match and sheet REST responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => ({
        ok: true,
        status: 200,
        json: async () => String(input).includes("match-sheets")
          ? [{ id: "sheet-1", matchId: "match-1", clubId: "club-1", submittedAt: null, status: "submitted" }]
          : [{ id: "match-1", awayClubId: "club-away", homeClubId: "club-home", refereeId: "ref-1", scheduledAt: "2026-07-01T18:00:00.000Z", venue: null, status: "scheduled" }],
      })),
    );

    await expect(fetchManagerDashboard()).resolves.toMatchObject({
      nextMatch: { id: "match-1", opponent: "club-away", venue: "Da definire" },
      matchSheetStatus: "submitted",
    });
  });

  it("submits the wizard match sheet to the backend submit endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "sheet-1",
        matchId: "match-1",
        clubId: "club-1",
        submittedAt: "2026-07-01T10:00:00.000Z",
        status: "submitted",
      }),
      input,
      init,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitMatchSheet("sheet-1")).resolves.toMatchObject({
      id: "sheet-1",
      status: "submitted",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/match-sheets/sheet-1/submit"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
