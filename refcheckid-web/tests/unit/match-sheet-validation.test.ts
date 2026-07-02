import { describe, expect, it } from "vitest";
import {
  getPlayerStatusTone,
  getMatchSheetSubmitError,
  lineupRoleOptions,
  validateMatchSheet,
} from "../../src/lib/match-sheet-validation";
import { pilotPlayers, pilotStaff } from "../../src/lib/pilot-data";

describe("unit: manager match sheet validation", () => {
  it("provides smoke-test pilot data with warnings, suspension, staff and photos", () => {
    expect(pilotPlayers).toHaveLength(18);
    expect(pilotStaff).toHaveLength(3);
    expect(pilotPlayers.some((player) => player.photoUrl)).toBe(true);
    expect(pilotPlayers.some((player) => player.warning)).toBe(true);
    expect(pilotPlayers.some((player) => player.suspended)).toBe(true);
  });

  it("marks warned players yellow and suspended players red/non-selectable in lineup helpers", () => {
    expect(getPlayerStatusTone(pilotPlayers.find((player) => player.warning)!)).toBe(
      "warning",
    );
    expect(
      getPlayerStatusTone(pilotPlayers.find((player) => player.suspended)!),
    ).toBe("suspended");
  });

  it("offers editable lineup roles separated from captain assignments", () => {
    expect(lineupRoleOptions.map((option) => option.label)).toEqual([
      "Portiere",
      "Titolare",
      "Riserva",
    ]);
    expect(pilotPlayers[0]).toMatchObject({
      isCaptain: false,
      isViceCaptain: false,
      role: "starter",
    });
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
      missingShirtNumberPlayers: [`${pilotPlayers[0]!.lastName} ${pilotPlayers[0]!.firstName}`],
    });
  });

  it("blocks duplicate shirt numbers before submit with a clear regression message", () => {
    const selectedPlayers = [
      { ...pilotPlayers[0]!, selected: true, shirtNumber: 10 },
      { ...pilotPlayers[1]!, selected: true, shirtNumber: 10 },
    ];
    const validation = validateMatchSheet(selectedPlayers, [pilotStaff[0]!]);
    expect(validation).toMatchObject({
      duplicateShirtNumbers: [10],
      isValid: false,
    });
    expect(validation.errors).toContain("Numeri di maglia duplicati: 10.");
    expect(getMatchSheetSubmitError(validation)).toBe(
      "Numeri di maglia duplicati",
    );
  });

  it("blocks double captain, double vice captain, and captain/vice conflicts", () => {
    const selectedPlayers = pilotPlayers
      .filter((player) => !player.suspended)
      .slice(0, 12)
      .map((player, index) => ({
        ...player,
        isCaptain: index < 2,
        isViceCaptain: index === 0 || index === 2 || index === 3,
        role: index === 0 ? "goalkeeper" as const : "starter" as const,
        selected: true,
        shirtNumber: index + 1,
      }));
    const validation = validateMatchSheet(selectedPlayers, [pilotStaff[0]!]);
    expect(validation).toMatchObject({
      captainViceConflicts: 1,
      captains: 2,
      isValid: false,
      viceCaptains: 3,
    });
    expect(validation.errors).toContain("Seleziona al massimo un Capitano.");
    expect(validation.errors).toContain("Seleziona al massimo un Vice capitano.");
  });

  it("counts goalkeeper plus ten starters as a valid eleven-person starting lineup", () => {
    const selectedPlayers = pilotPlayers
      .filter((player) => !player.suspended)
      .slice(0, 12)
      .map((player, index) => ({
        ...player,
        isCaptain: index === 1,
        isViceCaptain: index === 2,
        role: index === 0 || index === 11 ? "goalkeeper" as const : "starter" as const,
        selected: true,
        shirtNumber: index + 1,
      }));
    expect(validateMatchSheet(selectedPlayers, [pilotStaff[0]!])).toMatchObject({
      goalkeepers: 2,
      isValid: true,
      starters: 10,
      startingLineup: 12,
    });
  });

  it("allows a non-empty valid sheet", () => {
    const selectedPlayers = pilotPlayers
      .filter((player) => !player.suspended)
      .slice(0, 12)
      .map((player, index) => ({
        ...player,
        isCaptain: index === 1,
        isViceCaptain: index === 2,
        role: index === 0 ? "goalkeeper" as const : "starter" as const,
        selected: true,
        shirtNumber: index + 1,
      }));
    expect(validateMatchSheet(selectedPlayers, [pilotStaff[0]!])).toMatchObject({
      captains: 1,
      duplicateShirtNumbers: [],
      goalkeepers: 1,
      invalidPlayers: 0,
      isValid: true,
      missingNumbers: 0,
      starters: 11,
      viceCaptains: 1,
    });
    expect(
      getMatchSheetSubmitError(
        validateMatchSheet(selectedPlayers, [pilotStaff[0]!]),
      ),
    ).toBeNull();
  });
});
