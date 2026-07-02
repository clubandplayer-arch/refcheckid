import { afterEach, describe, expect, it, vi } from "vitest";
import { applyManagerPhotoOverrides, saveManagerSubjectPhoto } from "../../src/lib/manager-photo-store";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit: manager photo persistence", () => {
  it("persists uploaded photos by team and reapplies them after reopening the sheet", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    saveManagerSubjectPhoto("home", "pilot-player-1", "data:image/jpeg;base64,home-photo");

    expect(
      applyManagerPhotoOverrides("home", [
        { id: "pilot-player-1", photoUrl: "/placeholder-player.svg" },
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
});
