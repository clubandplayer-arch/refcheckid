import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiBaseUrl } from "../../src/lib/api-base-url";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit: API base URL resolution", () => {
  it("uses the same-origin Next.js API proxy in GitHub Codespaces", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "obscure-space-system-r4vwjw76p6wrcp6wp-3000.app.github.dev",
        protocol: "https:",
      },
    });

    expect(getApiBaseUrl()).toBe("/api/v1");
  });

  it("uses the same-origin Next.js API proxy during local browser development", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", protocol: "http:" },
    });

    expect(getApiBaseUrl()).toBe("/api/v1");
  });
});
