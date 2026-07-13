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
    expect(source).toContain("Nota foto tesserati");
    expect(source).toContain("PhotoExampleIllustration");
    expect(source).toContain("Esempio foto tesserato corretta");
    expect(
      source.match(
        /md:grid-cols-\[96px_minmax\(0,1fr\)_minmax\(220px,340px\)_32px\]/g,
      )?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain(
      "md:grid-cols-[32px_96px_minmax(0,1fr)_minmax(220px,340px)_minmax(220px,340px)]",
    );
    expect(source).toContain(`capture="environment"`);
  });

  it("requires image files, max size and preview confirmation", () => {
    expect(source).toContain(`file.type.startsWith("image/")`);
    expect(source).toContain("5 * 1024 * 1024");
    expect(source).toContain("Conferma una preview prima del salvataggio");
    expect(source).toContain("Conferma caricamento");
    expect(source).toContain("foto ufficiale corrente");
    expect(source).toContain("resta visibile");
    expect(source).toContain("Missing");
    expect(source).toContain("backend è la Source of Truth");
    expect(source).toContain("Upload Intent");
  });

  it("opens crop controls before saving the photo", () => {
    expect(source).toContain("Zoom foto");
    expect(source).toContain("min={0.4}");
    expect(source).toContain("max={3}");
    expect(source).toContain("object-contain");
    expect(source).toContain("h-24 w-20");
    expect(source).toContain("volto centrato, frontale e ben visibile");
    expect(source).toContain("Sposta foto orizzontale");
    expect(source).toContain("Sposta foto verticale");
    expect(source).toContain("cropPhotoDraft");
    expect(source).toContain("context.drawImage");
    expect(source).not.toContain("context.ellipse");
  });

  it("distinguishes missing official registrations from upload failures", () => {
    expect(source).toContain("officialPhotoUploadEnabled");
    expect(source).toContain("getOfficialPhotoUploadUnavailableReason");
    expect(source).toContain("Upload ufficiale non disponibile");
    expect(source).toContain("manca il tesseramento stagionale atleta");
    expect(source).toContain("manca il tesseramento stagionale staff");
    expect(source).toContain("uploadUnavailableReason");
    expect(source).toContain("disabled={Boolean(uploadUnavailableReason)}");
    expect(source).toContain("cursor-not-allowed opacity-60");
  });

  it("scopes photo errors to the subject that triggered them", () => {
    expect(source).toContain("type PhotoErrorState");
    expect(source).toContain("useState<PhotoErrorState | null>");
    expect(source).toContain('handlePhotoSelected("athlete", playerId, file)');
    expect(source).toContain(
      'handlePhotoSelected("staff_member", staffId, file)',
    );
    expect(source).toContain('confirmPhoto("athlete", playerId');
    expect(source).toContain('confirmPhoto("staff_member", staffId');
    expect(source).toContain('photoError?.subjectKind === "athlete"');
    expect(source).toContain('photoError?.subjectKind === "staff_member"');
    expect(source).toContain("photoError.subjectId === player.id");
    expect(source).toContain("photoError.subjectId === staffMember.id");
  });

  it("exposes a smoke-only reset for submitted sheets", () => {
    expect(source).toContain("Ripristina distinta di prova");
    expect(source).toContain("isSmokeResetAvailable");
    expect(source).toContain("resetSmokeMatchSheet");
    expect(source).toContain("Distinta inviata: non puoi più modificarla");
  });
});
