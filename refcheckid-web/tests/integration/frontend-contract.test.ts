import { describe, expect, it } from "vitest";
import { queryKeys } from "../../src/lib/api-client";

describe("integration: frontend workflow contracts", () => {
  it("exposes cache keys for all primary REST resources", () => {
    expect(Object.keys(queryKeys)).toEqual([
      "audit",
      "federation",
      "manager",
      "matches",
      "matchReports",
      "matchSheets",
      "photos",
      "players",
      "recognitions",
      "referees",
      "staff",
    ]);
  });
});
