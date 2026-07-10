import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const backendSource = readFileSync(join(process.cwd(), "src/lib/manager-photo-backend.ts"), "utf8");
const workflowSource = readFileSync(join(process.cwd(), "src/features/manager/match-sheet-workflow.tsx"), "utf8");
const flagSource = readFileSync(join(process.cwd(), "src/lib/photo-feature-flags.ts"), "utf8");

describe("ARCH-1 manager web photo migration", () => {
  it("centralizes ARCH-1 feature flags without introducing extra photo flags", () => {
    expect(flagSource).toContain("photos.officialBackendRead");
    expect(flagSource).toContain("photos.officialBackendUpload");
    expect(flagSource).toContain("photos.legacyLocalFallback");
    expect(flagSource).toContain("photos.dualWriteLegacy");
    expect(flagSource).not.toContain("managerPhoto");
  });

  it("uses Upload Intent and Upload Complete instead of localStorage as main upload flow", () => {
    expect(backendSource).toContain("/photos/upload-intent");
    expect(backendSource).toContain("/photos/uploads/");
    expect(backendSource).toContain("contentBase64");
    expect(backendSource).toContain("!uploadResponse.ok");
    expect(backendSource).toContain("registrationId: input.registrationId");
    expect(workflowSource).toContain("player.registrationId");
    expect(workflowSource).toContain('notify(message, "error")');
    expect(workflowSource).toContain("uploadOfficialPlayerPhoto");
    expect(workflowSource).toContain("Foto inviata al backend");
  });

  it("reads backend state, supports dual read fallback and displays replacement state", () => {
    expect(backendSource).toContain("/players/");
    expect(backendSource).toContain("/photo-approvals");
    expect(backendSource).toContain("legacyLocalFallback");
    expect(backendSource).toContain("applyManagerPhotoOverrides(team, players)");
    expect(backendSource).toContain(".sort((left, right)");
    expect(workflowSource).toContain("Pending Approval");
    expect(workflowSource).toContain("Foto ufficiale corrente");
    expect(workflowSource).toContain("Nuova foto proposta");
  });
});
