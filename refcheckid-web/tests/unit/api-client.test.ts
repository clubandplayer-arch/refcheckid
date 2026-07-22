import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchManagerDashboard,
  fetchMatchSheets,
  fetchPlayers,
  fetchStaff,
  request,
  submitMatchSheet,
} from "../../src/lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("unit: frontend API client", () => {
  it("maps API failures to rejected client promises", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403 })),
    );
    await expect(request("/secure-resource")).rejects.toThrow("403");
  });

  it("builds the manager dashboard from match and sheet REST responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(input).includes("match-sheets")
            ? [
                {
                  id: "sheet-1",
                  matchId: "match-1",
                  clubId: "club-1",
                  submittedAt: null,
                  status: "submitted",
                },
              ]
            : [
                {
                  id: "match-1",
                  awayClubId: "club-away",
                  homeClubId: "club-home",
                  refereeId: "ref-1",
                  scheduledAt: "2026-07-01T18:00:00.000Z",
                  venue: null,
                  status: "scheduled",
                },
              ],
      })),
    );

    await expect(fetchManagerDashboard()).resolves.toMatchObject({
      nextMatch: {
        id: "match-1",
        opponent: "Sporting Litorale",
        venue: "Da definire",
      },
      matchSheetStatus: "submitted",
    });
  });

  it("builds manager rosters only from current-club registrations", async () => {
    vi.stubEnv("NEXT_PUBLIC_PHOTOS_OFFICIALBACKENDREAD", "false");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/players")
        ? [
            { id: "player-home", firstName: "Home", lastName: "Player" },
            { id: "player-away", firstName: "Away", lastName: "Player" },
          ]
        : url.includes("/player-registrations")
          ? [
              {
                id: "registration-home",
                playerId: "player-home",
                clubId: "70000000-0000-4000-8000-000000000003",
                season: "2026",
                status: "active",
              },
            ]
          : url.includes("/staff-members")
            ? [
                { id: "staff-home", firstName: "Home", lastName: "Staff" },
                { id: "staff-away", firstName: "Away", lastName: "Staff" },
              ]
            : url.includes("/staff-registrations")
              ? [
                  {
                    id: "staff-registration-home",
                    staffMemberId: "staff-home",
                    clubId: "70000000-0000-4000-8000-000000000003",
                    season: "2026",
                    role: "Allenatore",
                    status: "active",
                  },
                ]
              : [];
      return { ok: true, status: 200, json: async () => body };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlayers()).resolves.toMatchObject([
      {
        id: "player-home",
        registrationId: "registration-home",
        season: "2026",
      },
    ]);
    await expect(fetchStaff()).resolves.toMatchObject([
      {
        id: "staff-home",
        fullName: "Home Staff",
        registrationId: "staff-registration-home",
        season: "2026",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/player-registrations?clubId=70000000-0000-4000-8000-000000000003",
      ),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/staff-registrations?clubId=70000000-0000-4000-8000-000000000003",
      ),
      expect.any(Object),
    );
  });

  it("opens the manager match-sheet roster without calling federation photo approvals", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/photo-approvals")) {
        return { ok: false, status: 403 };
      }
      if (url.includes("/registrations/registration-home/season-photo")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            signedUrl: { url: "https://photos.example/home.jpg" },
            version: { id: "version-home", status: "active" },
          }),
        };
      }
      if (url.includes("/registrations/staff-registration-home/season-photo")) {
        return { ok: false, status: 403 };
      }
      const body = url.includes("/players")
        ? [{ id: "player-home", firstName: "Home", lastName: "Player" }]
        : url.includes("/player-registrations")
          ? [
              {
                id: "registration-home",
                playerId: "player-home",
                clubId: "70000000-0000-4000-8000-000000000003",
                season: "2026",
                status: "active",
              },
            ]
          : url.includes("/staff-members")
            ? [{ id: "staff-home", fullName: "Home Staff" }]
            : url.includes("/staff-registrations")
              ? [
                  {
                    id: "staff-registration-home",
                    staffMemberId: "staff-home",
                    clubId: "70000000-0000-4000-8000-000000000003",
                    season: "2026",
                    role: "Allenatore",
                    status: "active",
                  },
                ]
              : [];
      return { ok: true, status: 200, json: async () => body };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlayers()).resolves.toMatchObject([
      {
        id: "player-home",
        registrationId: "registration-home",
        photoUrl: "https://photos.example/home.jpg",
        photo: {
          status: "active",
          currentPhotoUrl: "https://photos.example/home.jpg",
        },
      },
    ]);
    await expect(fetchStaff()).resolves.toMatchObject([
      {
        id: "staff-home",
        registrationId: "staff-registration-home",
        photo: { status: "missing", currentPhotoUrl: null },
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/photo-approvals"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/registrations/registration-home/season-photo"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/registrations/staff-registration-home/season-photo",
      ),
      expect.any(Object),
    );
  });

  it("does not expose local file signed photo URLs to browser image rendering", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/registrations/registration-home/season-photo")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            signedUrl: {
              url: "file:///workspaces/refcheckid/refcheckid-backend/storage/refcheckid-photos-dev/photo.png",
            },
            version: { id: "version-local", status: "active" },
          }),
        };
      }
      const body = url.includes("/players")
        ? [{ id: "player-home", firstName: "Home", lastName: "Player" }]
        : url.includes("/player-registrations")
          ? [
              {
                id: "registration-home",
                playerId: "player-home",
                clubId: "70000000-0000-4000-8000-000000000003",
                season: "2026",
                status: "active",
              },
            ]
          : [];
      return { ok: true, status: 200, json: async () => body };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlayers()).resolves.toMatchObject([
      {
        id: "player-home",
        photoUrl:
          "/api/v1/photos/versions/version-local/content?rendition=normalized",
        photo: {
          currentPhotoUrl:
            "/api/v1/photos/versions/version-local/content?rendition=normalized",
          status: "active",
        },
      },
    ]);
  });

  it("submits the wizard match sheet to the backend submit endpoint", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => ({
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
      }),
    );
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

  it("refreshes an expired manager session and sends Bearer auth to match-sheet APIs", async () => {
    const storage = new Map<string, string>();
    storage.set(
      "refcheckid.session",
      JSON.stringify({
        accessToken: "expired-access-token",
        refreshToken: "valid-refresh-token",
        expiresAt: "2000-01-01T00:00:00.000Z",
        user: {
          id: "90000000-0000-4000-8000-000000000001",
          email: "dirigente@refcheckid.local",
          role: "manager",
          displayName: "Dirigente Demo",
        },
      }),
    );
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/auth/refresh")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              accessToken: "fresh-access-token",
              refreshToken: "fresh-refresh-token",
              expiresAt: "2099-01-01T00:00:00.000Z",
              user: {
                id: "90000000-0000-4000-8000-000000000001",
                email: "dirigente@refcheckid.local",
                role: "manager",
                displayName: "Dirigente Demo",
              },
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "sheet-1",
              matchId: "match-1",
              clubId: "club-1",
              submittedAt: null,
              status: "draft",
            },
          ],
          init,
        };
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMatchSheets()).resolves.toHaveLength(1);

    const matchSheetCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/match-sheets"),
    );
    expect(matchSheetCall?.[1]).toMatchObject({
      headers: expect.objectContaining({
        authorization: "Bearer fresh-access-token",
      }),
    });
  });
});
