import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateWithPassword } from "../../src/lib/auth-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit: auth client", () => {
  it("posts pilot credentials to the backend auth endpoint by default", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: "2026-07-01T10:30:00.000Z",
        user: {
          id: "90000000-0000-4000-8000-000000000001",
          email: "dirigente@refcheckid.local",
          role: "manager",
          displayName: "Dirigente Demo",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      authenticateWithPassword({
        email: "dirigente@refcheckid.local",
        password: "Password123!",
      }),
    ).resolves.toMatchObject({ user: { role: "manager" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
