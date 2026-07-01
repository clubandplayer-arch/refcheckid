import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/referee/referee-match-workflow.tsx"),
  "utf8",
);

describe("regression: referee smoke workflow", () => {
  it("keeps one recognition advancement action plus back navigation", () => {
    expect(source).toContain("Swipe (destra→sinistra)");
    expect(source).toContain("Indietro");
    expect(source).not.toContain("Swipe sinistra");
    expect(source).not.toContain("Swipe destra\n");
  });

  it("shows locked recognition as terminal and routes to the report", () => {
    expect(source).toContain("Riconoscimento LOCKED");
    expect(source).toContain("Puoi proseguire solo con il referto");
    expect(source).toContain("Chiudi riconoscimento e vai al referto");
  });

  it("exposes editable report sections for goals, cards, dismissals and substitutions", () => {
    expect(source).toContain('eventKey="goals"');
    expect(source).toContain('eventKey="cautions"');
    expect(source).toContain('eventKey="expulsions"');
    expect(source).toContain('eventKey="substitutions"');
    expect(source).toContain("Aggiungi");
    expect(source).toContain("Rimuovi");
    expect(source).toContain("Tipo gol");
    expect(source).toContain("Numero uscente");
    expect(source).toContain("Numero entrante");
  });

  it("makes submitted reports read-only", () => {
    expect(source).toContain("isReadOnly");
    expect(source).toContain("disabled={readOnly}");
  });
});
