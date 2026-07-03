import { describe, expect, it } from "vitest";
import {
  goalTypes,
  resolveReportPlayerName,
  validateReportDraft,
} from "../../src/lib/referee-report-validation";
import type { MatchReportDraft, RecognitionSubject } from "../../src/lib/referee-types";

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

function subject(overrides: Partial<RecognitionSubject> = {}): RecognitionSubject {
  return {
    decision: "approved",
    document: { expiresAt: "2027-06-30", number: "DOC-1", type: "CI" },
    firstName: "Davide",
    id: "subject-1",
    lastName: "Moretti",
    photoUrl: null,
    roleLabel: "Titolare",
    shirtNumber: 5,
    subjectKind: "player",
    teamName: "Atletico Aurora",
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


  it("accepts roster-backed player names and shirt numbers", () => {
    const errors = validateReportDraft(
      report({
        awayGoals: 1,
        goals: [
          {
            detail: goalTypes[0],
            id: "goal-1",
            minute: 10,
            playerName: "Piras Giulio",
            shirtNumber: 13,
            teamName: "Ospite",
          },
        ],
      }),
      [
        subject(),
        subject({
          firstName: "Giulio",
          id: "subject-2",
          lastName: "Piras",
          shirtNumber: 13,
          teamName: "Sporting Litorale",
        }),
      ],
    );

    expect(errors).not.toContain("Gol: tesserato non coerente con squadra e maglia.");
    expect(errors).not.toContain("Gol: tesserato squalificato non selezionabile.");
  });


  it("blocks shirt numbers that are not in the selected team sheet", () => {
    const errors = validateReportDraft(
      report({
        awayGoals: 1,
        goals: [
          {
            detail: goalTypes[0],
            id: "goal-1",
            minute: 10,
            playerName: "Ospite #34",
            shirtNumber: 34,
            teamName: "Ospite",
          },
        ],
      }),
      [
        subject(),
        subject({
          firstName: "Giulio",
          id: "subject-2",
          lastName: "Piras",
          shirtNumber: 13,
          teamName: "Sporting Litorale",
        }),
      ],
    );

    expect(errors).toContain("Gol: tesserato non presente nella distinta della squadra.");
  });

  it("resolves player name from team and shirt number", () => {
    expect(resolveReportPlayerName("Ospite", 8)).toBe("Ospite #8");
  });




  it("blocks a reserve scoring before being substituted in", () => {
    const errors = validateReportDraft(
      report({
        awayGoals: 1,
        goals: [
          {
            detail: goalTypes[0],
            id: "goal-1",
            minute: 31,
            playerName: "Piras Giulio",
            shirtNumber: 15,
            teamName: "Ospite",
          },
        ],
      }),
      [
        subject(),
        subject({
          firstName: "Giulio",
          id: "subject-2",
          lastName: "Piras",
          roleLabel: "Riserva",
          shirtNumber: 15,
          teamName: "Sporting Litorale",
        }),
      ],
    );

    expect(errors).toContain("Gol: riserva non entrata in campo al minuto 31.");
  });

  it("blocks substitutions and expulsions before a player's prior events", () => {
    const errors = validateReportDraft(
      report({
        goals: [
          {
            detail: goalTypes[0],
            id: "goal-1",
            minute: 32,
            playerName: "Casa #10",
            shirtNumber: 10,
            teamName: "Casa",
          },
        ],
        homeGoals: 1,
        substitutions: [
          {
            detail: "",
            id: "substitution-1",
            incomingPlayerName: "Casa #15",
            incomingShirtNumber: 15,
            minute: 32,
            outgoingPlayerName: "Casa #10",
            outgoingShirtNumber: 10,
            playerName: "",
            teamName: "Casa",
          },
        ],
      }),
    );

    expect(errors).toContain(
      "Sostituzioni: tesserato con evento al minuto 32, uscita/espulsione solo dal minuto 33.",
    );
  });

  it("blocks events before a substitute has entered", () => {
    const errors = validateReportDraft(
      report({
        cautions: [
          {
            detail: "Proteste",
            id: "caution-1",
            minute: 50,
            playerName: "Casa #15",
            shirtNumber: 15,
            teamName: "Casa",
          },
        ],
        substitutions: [
          {
            detail: "",
            id: "substitution-1",
            incomingPlayerName: "Casa #15",
            incomingShirtNumber: 15,
            minute: 60,
            outgoingPlayerName: "Casa #10",
            outgoingShirtNumber: 10,
            playerName: "",
            teamName: "Casa",
          },
        ],
      }),
    );

    expect(errors).toContain("Ammonizioni: tesserato non ancora entrato al minuto 50.");
  });


  it("blocks substitutions after the outgoing player was sent off", () => {
    const errors = validateReportDraft(
      report({
        expulsions: [
          {
            detail: "Doppia ammonizione",
            id: "expulsion-1",
            minute: 42,
            playerName: "Ospite #11",
            shirtNumber: 11,
            teamName: "Ospite",
          },
        ],
        substitutions: [
          {
            detail: "",
            id: "substitution-1",
            incomingPlayerName: "Ospite #15",
            incomingShirtNumber: 15,
            minute: 50,
            outgoingPlayerName: "Ospite #11",
            outgoingShirtNumber: 11,
            playerName: "",
            teamName: "Ospite",
          },
        ],
      }),
    );

    expect(errors).toContain(
      "Sostituzioni: tesserato espulso al minuto 42, non può essere sostituito al minuto 50.",
    );
  });

  it("blocks duplicate substitution players across rows", () => {
    const errors = validateReportDraft(
      report({
        substitutions: [
          {
            detail: "",
            id: "substitution-1",
            incomingPlayerName: "Riva Leonardo",
            incomingShirtNumber: 15,
            minute: 49,
            outgoingPlayerName: "Marini Gabriele",
            outgoingShirtNumber: 10,
            playerName: "",
            teamName: "Casa",
          },
          {
            detail: "",
            id: "substitution-2",
            incomingPlayerName: "Riva Leonardo",
            incomingShirtNumber: 15,
            minute: 61,
            outgoingPlayerName: "Marini Gabriele",
            outgoingShirtNumber: 10,
            playerName: "",
            teamName: "Casa",
          },
        ],
      }),
    );

    expect(errors).toContain("Sostituzioni: tesserato già usato alla riga 2.");
  });

  it("blocks invalid minutes and substitution with same player", () => {
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
    expect(errors).toContain("Sostituzioni: entrante e uscente devono essere diversi.");
  });
});
