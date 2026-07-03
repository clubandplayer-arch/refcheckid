import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/referee/referee-match-workflow.tsx"),
  "utf8",
);

describe("regression: referee smoke workflow", () => {
  it("keeps one recognition advancement action plus back navigation", () => {
    expect(source).toContain("Conferma riconoscimento");
    expect(source).toContain("Indietro");
    expect(source).toContain("goBackToPreviousSubject");
    expect(source).not.toContain("Swipe sinistra");
    expect(source).not.toContain("Swipe destra\n");
  });

  it("shows locked recognition as terminal and routes to the report", () => {
    expect(source).toContain("Riconoscimento LOCKED");
    expect(source).toContain("Puoi proseguire solo con il referto");
    expect(source).toContain("Conferma chiusura riconoscimento");
    expect(source).toContain("Riconoscimento chiuso");
    expect(source).toContain("onMutate: onComplete");
  });

  it("exposes editable report sections for goals, cards, dismissals and substitutions", () => {
    expect(source).toContain('eventKey="goals"');
    expect(source).toContain('eventKey="cautions"');
    expect(source).toContain('eventKey="expulsions"');
    expect(source).toContain('eventKey="substitutions"');
    expect(source).toContain("Aggiungi");
    expect(source).toContain("Rimuovi");
    expect(source).toContain("Gol casa inseriti");
    expect(source).toContain("Gol ospite inseriti");
    expect(source).toContain("goalLimitReached");
    expect(source).toContain("Tipo gol");
    expect(source).toContain("Numero uscente");
    expect(source).toContain("Numero entrante");
    expect(source).toContain("usedSubstitutionNumbers");
    expect(source).toContain("expelledBeforeThisSubstitution");
  });

  it("disables recognition navigation after the report transition", () => {
    expect(source).toContain("isRecognitionStepDisabled");
    expect(source).toContain("disabled={isRecognitionStepDisabled}");
    expect(source).toContain("cursor-not-allowed opacity-50");
  });

  it("makes submitted reports read-only", () => {
    expect(source).toContain("isReadOnly");
    expect(source).toContain("disabled={readOnly}");
  });

  it("blocks report submission until both teams are recognized", () => {
    expect(source).toContain("Riconoscimento non completato per entrambe le squadre");
    expect(source).toContain("Distinta ospite mancante");
    expect(source).toContain("fullRecognitionComplete");
    expect(source).toContain("hasHomeRecognition");
    expect(source).toContain("hasAwayRecognition");
    expect(source).toContain("blockingErrors");
  });

});
