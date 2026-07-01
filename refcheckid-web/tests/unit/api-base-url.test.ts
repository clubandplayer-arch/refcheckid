import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiBaseUrl } from "../../src/lib/api-base-url";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit: API base URL resolution", () => {
  it("targets the forwarded backend port in GitHub Codespaces", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "obscure-space-system-r4vwjw76p6wrcp6wp-3000.app.github.dev",
        protocol: "https:",
      },
    });

    expect(getApiBaseUrl()).toBe(
      "https://obscure-space-system-r4vwjw76p6wrcp6wp-4000.app.github.dev/api/v1",
    );
  });

  it("targets localhost:4000 during local browser development", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", protocol: "http:" },
    });

    expect(getApiBaseUrl()).toBe("http://localhost:4000/api/v1");
  });
});
