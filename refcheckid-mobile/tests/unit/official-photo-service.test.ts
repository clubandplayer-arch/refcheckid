import { describe, expect, it, vi } from "vitest";
import { MemoryOfficialPhotoCacheStorage, OfficialPhotoCache } from "../../src/lib/official-photo-cache";
import { OfficialPhotoService, type OfficialPhotoRequestClient } from "../../src/lib/official-photo-service";
import { toPhotoStateViewModel } from "../../src/lib/photo-state-ui";

function service(requests: Record<string, unknown>, online = true, flags = new Map<string, string>()) {
  const calls: string[] = [];
  const client: OfficialPhotoRequestClient = { async request<T>(path: string): Promise<T> { calls.push(path); return requests[path] as T; } };
  const cache = new OfficialPhotoCache(new MemoryOfficialPhotoCacheStorage());
  const photoService = new OfficialPhotoService(client, cache, { isOnline: () => online }, { get: (name) => flags.get(name) });
  return { photoService, calls, cache };
}

describe("Manager Mobile ARCH-1 official photo service", () => {
  it("reads backend state and does not reconstruct photo status locally", async () => {
    const { photoService, calls } = service({
      "/players/p1/photo?rendition=normalized&ttlSeconds=300": { signedUrl: { url: "https://cdn/current" }, version: { status: "active", etag: "e1" } },
      "/photo-approvals?registrationId=r1": [{ id: "a1", photoVersionId: "v2", registrationId: "r1", requestedAt: "2026-01-01", status: "pending" }],
      "/photos/versions/v2/content?rendition=normalized&ttlSeconds=300": { signedUrl: { url: "https://cdn/proposed" } },
    });
    await expect(photoService.readPlayerPhotoState({ id: "p1", registrationId: "r1" })).resolves.toEqual({ status: "pending", currentPhotoUrl: "https://cdn/current", proposedPhotoUrl: "https://cdn/proposed", approvalId: "a1" });
    expect(calls).toEqual(["/players/p1/photo?rendition=normalized&ttlSeconds=300", "/photo-approvals?registrationId=r1", "/photos/versions/v2/content?rendition=normalized&ttlSeconds=300"]);
  });

  it("uses cache as temporary offline copy without backend writes", async () => {
    const { photoService, cache } = service({ "/players/p1/photo?rendition=normalized&ttlSeconds=300": { signedUrl: { url: "https://cdn/current" }, version: { status: "active" } }, "/photo-approvals?registrationId=r1": [] });
    await photoService.readPlayerPhotoState({ id: "p1", registrationId: "r1" });
    const offline = new OfficialPhotoService({ request: vi.fn() }, cache, { isOnline: () => false });
    await expect(offline.readPlayerPhotoState({ id: "p1", registrationId: "r1" })).resolves.toMatchObject({ status: "active", currentPhotoUrl: "https://cdn/current" });
  });

  it("uses Upload Intent and Upload Complete and rejects uploads offline", async () => {
    const { photoService, calls } = service({
      "/photos/upload-intent": { intent: { uploadId: "u1", objectKey: "objects/p1" } },
      "/photos/uploads/u1/complete": {},
      "/players/p1/photo?rendition=normalized&ttlSeconds=300": { signedUrl: { url: "https://cdn/new" }, version: { status: "active" } },
      "/photo-approvals?registrationId=r1": [],
    });
    await expect(photoService.uploadOfficialPlayerPhoto({ playerId: "p1", registrationId: "r1", clubId: "c1", federationId: "f1", seasonId: "s1", mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) })).resolves.toMatchObject({ status: "active" });
    expect(calls).toContain("/photos/upload-intent");
    expect(calls).toContain("/photos/uploads/u1/complete");

    const offline = service({}, false).photoService;
    await expect(offline.uploadOfficialPlayerPhoto({ playerId: "p1", registrationId: "r1", clubId: "c1", federationId: "f1", seasonId: "s1", mimeType: "image/jpeg", bytes: new Uint8Array([1]) })).rejects.toThrow("offline");
  });

  it("uses existing ARCH-1 flags and renders backend states", async () => {
    const { photoService } = service({}, false, new Map([["photos.legacyLocalFallback", "true"]]));
    await expect(photoService.readPlayerPhotoState({ id: "p1", registrationId: null, photoUrl: "legacy" })).resolves.toMatchObject({ status: "active", currentPhotoUrl: "legacy" });
    expect(toPhotoStateViewModel({ status: "suspended", currentPhotoUrl: "url", proposedPhotoUrl: null, approvalId: null })).toMatchObject({ label: "Suspended", tone: "danger" });
  });
});
