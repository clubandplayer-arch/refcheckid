import { describe, expect, it } from "vitest";
import {
  initialMatchReport,
  recognitionSubjects,
  refereeDashboard,
  teamSheetVerifications,
} from "../src/lib/referee-mock-data";

function progressAfterDecision(index: number, total: number) {
  return Math.min(index + 1, total);
}

describe("referee workflow data", () => {
  it("contains a next match ready to open", () => {
    expect(refereeDashboard.nextMatch).not.toBeNull();
    expect(refereeDashboard.nextMatch?.status).toBe("sheets_locked");
  });

  it("allows recognition only when both sheets are locked", () => {
    expect(teamSheetVerifications).toHaveLength(2);
    expect(
      teamSheetVerifications.every((sheet) => sheet.status === "locked"),
    ).toBe(true);
  });

  it("contains recognition subjects with document references", () => {
    expect(recognitionSubjects.length).toBeGreaterThan(0);
    expect(
      recognitionSubjects.every(
        (subject) => subject.document.number.length > 0,
      ),
    ).toBe(true);
  });

  it("tracks recognition progress after a swipe decision", () => {
    expect(progressAfterDecision(0, recognitionSubjects.length)).toBe(1);
  });

  it("contains a complete report draft structure", () => {
    expect(
      initialMatchReport.homeGoals + initialMatchReport.awayGoals,
    ).toBeGreaterThan(0);
    expect(initialMatchReport.goals.length).toBeGreaterThan(0);
    expect(initialMatchReport.refereeNotes.length).toBeGreaterThan(0);
  });
});
