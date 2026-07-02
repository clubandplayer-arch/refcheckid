import { describe, expect, it } from "vitest";
import {
  goalTypes,
  resolveReportPlayerName,
  validateReportDraft,
} from "../../src/lib/referee-report-validation";
import type { MatchReportDraft } from "../../src/lib/referee-types";

function report(overrides: Partial<MatchReportDraft> = {}): MatchReportDraft {
  return {
    awayGoals: 0,
    cautions: [],
    expulsions: [],
    goals: [],
    homeGoals: 0,
    id: "report-1",
    refereeNotes: "",
    status: "draft",
    substitutions: [],
    ...overrides,
  };
}

describe("regression: referee report validation", () => {
  it("blocks goals inserted outside chronological order", () => {
    const errors = validateReportDraft(
      report({
        goals: [
          {
            detail: goalTypes[0],
            id: "goal-1",
            minute: 7,
            playerName: "Casa #9",
            shirtNumber: 9,
            teamName: "Casa",
          },
          {
            detail: goalTypes[1],
            id: "goal-2",
            minute: 5,
            playerName: "Casa #10",
            shirtNumber: 10,
            teamName: "Casa",
          },
        ],
      }),
    );

    expect(errors).toContain("Gol: eventi non in ordine cronologico.");
  });


  it("blocks report submission when goal events do not match the final score", () => {
    const errors = validateReportDraft(
      report({
        awayGoals: 1,
        goals: [
          {
            detail: goalTypes[0],
            id: "goal-1",
            minute: 1,
            playerName: "Casa #9",
            shirtNumber: 9,
            teamName: "Casa",
          },
          {
            detail: goalTypes[0],
            id: "goal-2",
            minute: 2,
            playerName: "Casa #10",
            shirtNumber: 10,
            teamName: "Casa",
          },
          {
            detail: goalTypes[0],
            id: "goal-3",
            minute: 3,
            playerName: "Ospite #7",
            shirtNumber: 7,
            teamName: "Ospite",
          },
        ],
        homeGoals: 1,
      }),
    );

    expect(errors).toContain("Gol: gol Casa inseriti 2/1.");
    expect(errors).toContain("Gol: numero eventi superiore al risultato finale.");
  });

  it("requires goal events to match both home and away final score totals", () => {
    const errors = validateReportDraft(
      report({
        awayGoals: 1,
        goals: [
          {
            detail: goalTypes[0],
            id: "goal-1",
            minute: 1,
            playerName: "Casa #9",
            shirtNumber: 9,
            teamName: "Casa",
          },
        ],
        homeGoals: 1,
      }),
    );

    expect(errors).toContain("Gol: gol Ospite inseriti 0/1.");
  });

  it("resolves player name from team and shirt number", () => {
    expect(resolveReportPlayerName("Ospite", 8)).toBe("Ospite #8");
  });

  it("blocks invalid minutes, suspended players and substitution with same player", () => {
    const errors = validateReportDraft(
      report({
        cautions: [
          {
            detail: "Proteste",
            id: "caution-1",
            minute: 121,
            playerName: "Casa #2",
            shirtNumber: 2,
            teamName: "Casa",
          },
        ],
        expulsions: [
          {
            detail: "Condotta violenta",
            id: "expulsion-1",
            minute: 80,
            playerName: "Casa #13",
            shirtNumber: 13,
            teamName: "Casa",
          },
        ],
        substitutions: [
          {
            detail: "",
            id: "substitution-1",
            incomingPlayerName: "Ospite #6",
            incomingShirtNumber: 6,
            minute: 60,
            outgoingPlayerName: "Ospite #6",
            outgoingShirtNumber: 6,
            playerName: "",
            teamName: "Ospite",
          },
        ],
      }),
    );

    expect(errors).toContain("Ammonizioni: minuto non valido alla riga 1.");
    expect(errors).toContain("Espulsioni: tesserato squalificato non selezionabile.");
    expect(errors).toContain("Sostituzioni: entrante e uscente devono essere diversi.");
  });
});
