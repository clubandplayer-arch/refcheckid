import { describe, expect, it } from "vitest";
import { queryKeys } from "../src/lib/api-client";
import type { FederationReport } from "../src/lib/federation-types";
import type { AppSession } from "../src/lib/session";

function sessionHeaders(session: AppSession) {
  return { authorization: `Bearer ${session.accessToken}` };
}

function filterReports(reports: readonly FederationReport[], query: string) {
  return reports.filter((report) =>
    `${report.homeTeam} ${report.awayTeam} ${report.refereeName}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
}

describe("frontend backend integration contracts", () => {
  it("defines query cache scopes for every workflow area", () => {
    expect(queryKeys.manager).toEqual(["manager"]);
    expect(queryKeys.referees).toEqual(["referees"]);
    expect(queryKeys.federation).toEqual(["federation"]);
  });

  it("maps stored sessions to backend authentication headers", () => {
    expect(
      sessionHeaders({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: "2026-07-01T10:00:00.000Z",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "dirigente@refcheckid.local",
          role: "manager",
          displayName: "Dirigente Demo",
        },
      }),
    ).toEqual({
      authorization: "Bearer access-token",
    });
  });

  it("keeps federation report filtering read-only", () => {
    const reports: readonly FederationReport[] = [
      {
        awayTeam: "Beta",
        cautions: [],
        commissionerNotes: null,
        expulsions: [],
        goals: [],
        homeTeam: "Alpha",
        id: "report-1",
        matchId: "match-1",
        refereeName: "Elena Riva",
        refereeNotes: "Note",
        result: { awayGoals: 0, homeGoals: 1 },
        submittedAt: "2026-07-01T10:00:00.000Z",
        substitutions: [],
      },
    ];
    expect(filterReports(reports, "Elena")).toHaveLength(1);
    expect(reports[0]).not.toHaveProperty("editable");
  });
});
