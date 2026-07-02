import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/manager/match-sheet-workflow.tsx"),
  "utf8",
);

describe("regression: manager photo capture flow", () => {
  it("shows photo actions for players and staff with smartphone guidance", () => {
    expect(source).toContain("Aggiungi foto");
    expect(source).toContain("Modifica foto");
    expect(source).toContain("Scatta/carica foto");
    expect(source).toContain("Smartphone consigliato");
    expect(source).toContain(`capture="environment"`);
  });

  it("requires image files, max size and preview confirmation", () => {
    expect(source).toContain(`file.type.startsWith("image/")`);
    expect(source).toContain("5 * 1024 * 1024");
    expect(source).toContain("Conferma una preview prima del salvataggio");
    expect(source).toContain("Conferma caricamento");
    expect(source).toContain("Foto mancante");
  });
});
