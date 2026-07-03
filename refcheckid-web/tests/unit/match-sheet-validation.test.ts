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
      "Titolare",
      "Riserva",
    ]);
    expect(pilotPlayers[0]).toMatchObject({
      isCaptain: false,
      isGoalkeeper: true,
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
        isGoalkeeper: index === 0,
        role: "starter" as const,
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

  it("counts goalkeepers separately from the eleven starters", () => {
    const selectedPlayers = pilotPlayers
      .filter((player) => !player.suspended)
      .slice(0, 12)
      .map((player, index) => ({
        ...player,
        isCaptain: index === 1,
        isViceCaptain: index === 2,
        isGoalkeeper: index === 0 || index === 11,
        role: index < 11 ? "starter" as const : "reserve" as const,
        selected: true,
        shirtNumber: index + 1,
      }));
    expect(validateMatchSheet(selectedPlayers, [pilotStaff[0]!])).toMatchObject({
      goalkeepers: 2,
      isValid: true,
      starters: 11,
      startingLineup: 11,
    });
  });




  it("allows reserve goalkeepers but only one starting goalkeeper", () => {
    const selectedPlayers = pilotPlayers
      .filter((player) => !player.suspended)
      .slice(0, 13)
      .map((player, index) => ({
        ...player,
        isCaptain: index === 1,
        isGoalkeeper: index === 0 || index === 1 || index === 11 || index === 12,
        isViceCaptain: index === 2,
        role: index < 11 ? "starter" as const : "reserve" as const,
        selected: true,
        shirtNumber: index + 1,
      }));

    const validation = validateMatchSheet(selectedPlayers, [pilotStaff[0]!]);

    expect(validation).toMatchObject({
      goalkeepers: 4,
      isValid: false,
      startingGoalkeepers: 2,
    });
    expect(validation.errors).toContain("Seleziona un solo Portiere tra gli 11 titolari.");
  });

  it("blocks captain and vice captain assigned to reserves", () => {
    const selectedPlayers = pilotPlayers
      .filter((player) => !player.suspended)
      .slice(0, 13)
      .map((player, index) => ({
        ...player,
        isCaptain: index === 11,
        isGoalkeeper: index === 0,
        isViceCaptain: index === 12,
        role: index < 11 ? "starter" as const : "reserve" as const,
        selected: true,
        shirtNumber: index + 1,
      }));

    const validation = validateMatchSheet(selectedPlayers, [pilotStaff[0]!]);

    expect(validation).toMatchObject({
      captains: 1,
      isValid: false,
      viceCaptains: 1,
    });
    expect(validation.errors).toContain("Il Capitano deve essere scelto tra i titolari.");
    expect(validation.errors).toContain("Il Vice capitano deve essere scelto tra i titolari.");
  });

  it("blocks more than eleven starters", () => {
    const selectedPlayers = pilotPlayers
      .filter((player) => !player.suspended)
      .slice(0, 15)
      .map((player, index) => ({
        ...player,
        isCaptain: index === 0,
        isGoalkeeper: index === 0,
        isViceCaptain: index === 1,
        role: index < 14 ? "starter" as const : "reserve" as const,
        selected: true,
        shirtNumber: index + 1,
      }));

    const validation = validateMatchSheet(selectedPlayers, [pilotStaff[0]!]);

    expect(validation).toMatchObject({
      isValid: false,
      starters: 14,
    });
    expect(validation.errors).toContain("Seleziona al massimo 11 titolari.");
  });

  it("allows many registered players but limits bench players and staff", () => {
    const selectedPlayers = Array.from({ length: 32 }, (_, index) => ({
      ...pilotPlayers[index % pilotPlayers.length]!,
      firstName: `Nome${index + 1}`,
      id: `player-${index + 1}`,
      isCaptain: index === 0,
      isGoalkeeper: index === 0,
      isViceCaptain: index === 1,
      lastName: `Cognome${index + 1}`,
      role: index < 11 ? "starter" as const : "reserve" as const,
      selected: true,
      shirtNumber: index + 1,
      suspended: false,
      warning: false,
    }));
    const selectedStaff = Array.from({ length: 6 }, (_, index) => ({
      ...pilotStaff[index % pilotStaff.length]!,
      fullName: `Staff ${index + 1}`,
      id: `staff-${index + 1}`,
      selected: true,
    }));

    const validation = validateMatchSheet(selectedPlayers, selectedStaff);

    expect(validation).toMatchObject({
      benchPlayers: 21,
      isValid: false,
      starters: 11,
    });
    expect(validation.errors).toContain("Seleziona al massimo 20 giocatori in panchina.");
    expect(validation.errors).toContain("Seleziona al massimo 5 membri dello staff in panchina.");
  });

  it("allows a non-empty valid sheet", () => {
    const selectedPlayers = pilotPlayers
      .filter((player) => !player.suspended)
      .slice(0, 12)
      .map((player, index) => ({
        ...player,
        isCaptain: index === 1,
        isViceCaptain: index === 2,
        isGoalkeeper: index === 0,
        role: index < 11 ? "starter" as const : "reserve" as const,
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
