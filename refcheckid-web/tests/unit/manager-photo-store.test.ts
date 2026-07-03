import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyManagerPhotoOverrides,
  decideManagerPhotoApprovalRequest,
  readManagerPhotoApprovalRequests,
  saveManagerSubjectPhoto,
} from "../../src/lib/manager-photo-store";

function stubStorage() {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit: manager photo persistence", () => {
  it("persists missing uploaded photos by team and reapplies them after reopening the sheet", () => {
    stubStorage();

    expect(saveManagerSubjectPhoto("home", "pilot-player-1", "data:image/jpeg;base64,home-photo")).toBe("approved");

    expect(
      applyManagerPhotoOverrides("home", [
        { id: "pilot-player-1", photoUrl: null },
        { id: "pilot-player-2", photoUrl: "/placeholder-player.svg" },
      ]),
    ).toEqual([
      { id: "pilot-player-1", photoUrl: "data:image/jpeg;base64,home-photo" },
      { id: "pilot-player-2", photoUrl: "/placeholder-player.svg" },
    ]);
    expect(
      applyManagerPhotoOverrides("away", [
        { id: "pilot-player-1", photoUrl: "/placeholder-player.svg" },
      ]),
    ).toEqual([{ id: "pilot-player-1", photoUrl: "/placeholder-player.svg" }]);
  });

  it("keeps an existing tesserato photo unchanged until federation approval", () => {
    stubStorage();

    expect(
      saveManagerSubjectPhoto(
        "home",
        "pilot-player-1",
        "data:image/jpeg;base64,new-photo",
        "/placeholder-player.svg",
        "Rossi Mario",
      ),
    ).toBe("pending");

    expect(
      applyManagerPhotoOverrides("home", [
        { id: "pilot-player-1", photoUrl: "/placeholder-player.svg" },
      ]),
    ).toEqual([{ id: "pilot-player-1", photoUrl: "/placeholder-player.svg" }]);
    expect(readManagerPhotoApprovalRequests()).toMatchObject([
      {
        clubName: "Atletico Aurora",
        currentPhotoUrl: "/placeholder-player.svg",
        playerName: "Rossi Mario",
        proposedPhotoUrl: "data:image/jpeg;base64,new-photo",
        status: "pending",
        subjectId: "pilot-player-1",
        team: "home",
      },
    ]);
  });

  it("applies or rejects the proposed photo when federation decides", () => {
    stubStorage();
    saveManagerSubjectPhoto(
      "home",
      "pilot-player-1",
      "data:image/jpeg;base64,new-photo",
      "/placeholder-player.svg",
      "Rossi Mario",
    );

    decideManagerPhotoApprovalRequest("home.pilot-player-1", "approved");

    expect(
      applyManagerPhotoOverrides("home", [
        { id: "pilot-player-1", photoUrl: "/placeholder-player.svg" },
      ]),
    ).toEqual([{ id: "pilot-player-1", photoUrl: "data:image/jpeg;base64,new-photo" }]);
    expect(readManagerPhotoApprovalRequests()[0]).toMatchObject({ status: "approved" });
  });
});
