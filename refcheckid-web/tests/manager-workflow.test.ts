import { describe, expect, it } from "vitest";
import { managerDashboard, players, staff } from "../src/lib/mock-data";

describe("manager workflow data", () => {
  it("contains dashboard essentials", () => {
    expect(managerDashboard.nextMatch).not.toBeNull();
    expect(managerDashboard.notifications.length).toBeGreaterThan(0);
  });

  it("contains selectable players and staff", () => {
    expect(players.some((player) => player.selected)).toBe(true);
    expect(staff.some((staffMember) => staffMember.selected)).toBe(true);
  });
});
