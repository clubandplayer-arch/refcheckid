import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateWithPassword } from "../../src/lib/auth-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit: auth client", () => {
  it("posts pilot credentials to the backend auth endpoint by default", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
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
    vi.stubGlobal("window", {
      location: {
        hostname: "obscure-space-system-r4vwjw76p6wrcp6wp-3000.app.github.dev",
        protocol: "https:",
      },
    });

    await expect(
      authenticateWithPassword({
        email: "dirigente@refcheckid.local",
        password: "Password123!",
      }),
    ).resolves.toMatchObject({ user: { role: "manager" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
