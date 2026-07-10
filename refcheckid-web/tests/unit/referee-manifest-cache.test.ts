import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("unit: referee manifest cache policy", () => {
  const workflowSource = readFileSync(
    join(process.cwd(), "src/features/referee/referee-match-workflow.tsx"),
    "utf8",
  );
  const refereeClientSource = readFileSync(
    join(process.cwd(), "src/lib/referee-api-client.ts"),
    "utf8",
  );

  it("pins the recognition manifest query for the whole recognition session", () => {
    expect(workflowSource).toContain("staleTime: Number.POSITIVE_INFINITY");
    expect(workflowSource).toContain("refetchOnWindowFocus: false");
    expect(workflowSource).toContain("refetchOnReconnect: false");
    expect(workflowSource).toContain("refetchOnMount: false");
    expect(workflowSource).toContain("refetchInterval: false");
    expect(workflowSource).toContain("retry: false");
    expect(workflowSource).toContain("...manifestQueryOptions");
  });

  it("keeps referee recognition on the preloaded manifest endpoint", () => {
    expect(refereeClientSource).toContain("fetchMatchPhotoManifest(matchId)");
    expect(refereeClientSource).not.toContain("/players/${encodeURIComponent");
    expect(refereeClientSource).not.toContain("/photo?rendition");
    expect(refereeClientSource).not.toContain("fetchPlayers");
  });
});
