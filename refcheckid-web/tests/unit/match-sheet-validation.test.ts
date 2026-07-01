import { describe, expect, it } from "vitest";
import { validateMatchSheet } from "../../src/lib/match-sheet-validation";
import { pilotPlayers, pilotStaff } from "../../src/lib/pilot-data";

describe("unit: manager match sheet validation", () => {
  it("provides smoke-test pilot data with warnings, suspension, staff and photos", () => {
    expect(pilotPlayers).toHaveLength(18);
    expect(pilotStaff).toHaveLength(3);
    expect(pilotPlayers.some((player) => player.photoUrl)).toBe(true);
    expect(pilotPlayers.some((player) => player.warning)).toBe(true);
    expect(pilotPlayers.some((player) => player.suspended)).toBe(true);
  });

  it("blocks empty match sheets", () => {
    expect(validateMatchSheet([], [])).toMatchObject({
      isValid: false,
      missingNumbers: 0,
    });
  });

  it("blocks missing shirt numbers and invalid players", () => {
    const selectedPlayers = [
      { ...pilotPlayers[0]!, selected: true, shirtNumber: null },
      { ...pilotPlayers[12]!, selected: true, shirtNumber: 13 },
    ];
    expect(validateMatchSheet(selectedPlayers, [pilotStaff[0]!])).toMatchObject({
      invalidPlayers: 1,
      isValid: false,
      missingNumbers: 1,
    });
  });

  it("allows a non-empty valid sheet", () => {
    const selectedPlayers = pilotPlayers
      .filter((player) => !player.suspended)
      .slice(0, 11)
      .map((player, index) => ({ ...player, selected: true, shirtNumber: index + 1 }));
    expect(validateMatchSheet(selectedPlayers, [pilotStaff[0]!])).toMatchObject({
      invalidPlayers: 0,
      isValid: true,
      missingNumbers: 0,
    });
  });
});
