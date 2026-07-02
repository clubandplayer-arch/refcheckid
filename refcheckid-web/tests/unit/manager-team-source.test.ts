import { describe, expect, it } from "vitest";
import { getManagerTeamByEmail, managerTeamConfig } from "../../src/lib/manager-team";
import { pilotAwayPlayers, pilotAwayStaff, pilotPlayers, pilotStaff } from "../../src/lib/pilot-data";

describe("regression: two manager pilot teams", () => {
  it("maps the pilot manager accounts to home and away teams", () => {
    expect(getManagerTeamByEmail("dirigente@refcheckid.local")).toBe("home");
    expect(getManagerTeamByEmail("dirigenteospite@refcheckid.local")).toBe("away");
    expect(managerTeamConfig.home.label).toBe("Atletico Aurora");
    expect(managerTeamConfig.away.label).toBe("Sporting Litorale");
  });

  it("keeps separate home and away pilot rosters", () => {
    expect(pilotPlayers[0]?.id).not.toBe(pilotAwayPlayers[0]?.id);
    expect(pilotStaff[0]?.id).not.toBe(pilotAwayStaff[0]?.id);
  });
});
