import { describe, expect, it } from "vitest";
import {
  federationDashboard,
  federationHistory,
  federationMatches,
  federationReports,
  photoRequests,
} from "../src/lib/federation-mock-data";

function filterMatches(matchday: string, reportStatus: string) {
  return federationMatches.filter((match) => {
    const matchdayMatches =
      matchday === "all" || String(match.matchday) === matchday;
    const statusMatches =
      reportStatus === "all" || match.reportStatus === reportStatus;
    return matchdayMatches && statusMatches;
  });
}

function searchHistory(query: string) {
  return federationHistory.filter((item) => {
    const searchable =
      `${item.matchLabel} ${item.clubNames.join(" ")} ${item.refereeName}`.toLowerCase();
    return searchable.includes(query.toLowerCase());
  });
}

describe("federation workflow data", () => {
  it("contains dashboard federation counters", () => {
    expect(federationDashboard.reportsReceived).toBeGreaterThan(0);
    expect(federationDashboard.notifications.length).toBeGreaterThan(0);
  });

  it("filters calendar matches by matchday and report status", () => {
    expect(filterMatches("7", "submitted")).toHaveLength(1);
    expect(filterMatches("7", "all").length).toBeGreaterThan(1);
  });

  it("keeps report details read-only in data shape", () => {
    const report = federationReports[0];
    expect(report?.result.homeGoals).toBe(2);
    expect(report?.refereeNotes.length).toBeGreaterThan(0);
    expect(report).not.toHaveProperty("editable");
  });

  it("contains photo requests with review statuses", () => {
    expect(photoRequests.some((request) => request.status === "pending")).toBe(
      true,
    );
    expect(
      photoRequests.every((request) => request.playerName.length > 0),
    ).toBe(true);
  });

  it("searches history by club or referee", () => {
    expect(searchHistory("Aurora")).toHaveLength(1);
    expect(searchHistory("Sara")).toHaveLength(1);
  });
});
