import { request } from "./api-client";
import { getPhotoFeatureFlags } from "./photo-feature-flags";
import type { PlayerListItem, StaffListItem } from "./types";

export type OfficialPhotoStatus = "missing" | "pending" | "active" | "rejected" | "suspended";

export interface ManagerPhotoState {
  readonly status: OfficialPhotoStatus;
  readonly currentPhotoUrl: string | null;
  readonly proposedPhotoUrl: string | null;
  readonly approvalId: string | null;
}

interface SignedReadResponse { signedUrl?: { url?: string }; version?: { status?: string } }
interface ApprovalResponse { id: string; photoVersionId: string; registrationId: string | null; status: string; decisionReasonCode?: string | null; decisionNotes?: string | null }
interface UploadIntentResponse { intent: { uploadId: string; objectKey: string; uploadUrl?: { url?: string; method?: string; headers?: Record<string, string> } } }

export async function enrichPlayersWithBackendPhotos(players: readonly PlayerListItem[]): Promise<readonly PlayerListItem[]> {
  const flags = getPhotoFeatureFlags();
  if (!flags.officialBackendRead) return players;
  return Promise.all(players.map(async (player) => {
    const photo = await readBackendPhotoState(player.id, player.photoUrl);
    return { ...player, photo, photoUrl: photo.currentPhotoUrl ?? player.photoUrl };
  }));
}

export function enrichStaffWithBackendStatus(staff: readonly StaffListItem[]): readonly StaffListItem[] {
  return staff.map((member) => ({
    ...member,
    photo: { status: member.photoUrl ? "active" : "missing", currentPhotoUrl: member.photoUrl, proposedPhotoUrl: null, approvalId: null },
  }));
}

export async function readBackendPhotoState(playerId: string, legacyPhotoUrl: string | null): Promise<ManagerPhotoState> {
  const flags = getPhotoFeatureFlags();
  let currentPhotoUrl: string | null = null;
  let currentStatus: OfficialPhotoStatus = "missing";
  try {
    const signed = await request<SignedReadResponse>(`/players/${encodeURIComponent(playerId)}/photo?rendition=normalized&ttlSeconds=300`);
    currentPhotoUrl = signed.signedUrl?.url ?? null;
    currentStatus = signed.version?.status === "suspended" ? "suspended" : currentPhotoUrl ? "active" : "missing";
  } catch {
    if (flags.legacyLocalFallback) currentPhotoUrl = legacyPhotoUrl;
    currentStatus = currentPhotoUrl ? "active" : "missing";
  }
  const approval = await readLatestApproval(playerId);
  if (!approval) return { approvalId: null, currentPhotoUrl, proposedPhotoUrl: null, status: currentStatus };
  const proposedPhotoUrl = await readVersionUrl(approval.photoVersionId).catch(() => null);
  if (approval.status === "pending") return { approvalId: approval.id, currentPhotoUrl, proposedPhotoUrl, status: "pending" };
  if (approval.status === "rejected") return { approvalId: approval.id, currentPhotoUrl, proposedPhotoUrl, status: "rejected" };
  return { approvalId: approval.id, currentPhotoUrl: proposedPhotoUrl ?? currentPhotoUrl, proposedPhotoUrl: null, status: "active" };
}

export async function uploadOfficialPlayerPhoto(input: { playerId: string; registrationId?: string | null; clubId: string; federationId: string; seasonId: string; dataUrl: string; mimeType?: string }): Promise<ManagerPhotoState> {
  const flags = getPhotoFeatureFlags();
  if (!flags.officialBackendUpload) throw new Error("Upload backend disabilitato dal feature flag photos.officialBackendUpload.");
  const bytes = dataUrlToBytes(input.dataUrl);
  const mimeType = input.mimeType ?? input.dataUrl.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg";
  const sha256 = await sha256Hex(bytes);
  const intentResponse = await request<UploadIntentResponse>("/photos/upload-intent", {
    method: "POST",
    body: JSON.stringify({
      playerId: input.playerId,
      registrationId: input.registrationId ?? input.playerId,
      federationId: input.federationId,
      seasonId: input.seasonId,
      mimeType,
      fileSizeBytes: bytes.byteLength,
      sha256,
      actorRole: "manager",
      clubId: input.clubId,
      registrationClubId: input.clubId,
    }),
  });
  const { uploadId, objectKey, uploadUrl } = intentResponse.intent;
  if (uploadUrl?.url && uploadUrl.url.startsWith("http")) {
    await fetch(uploadUrl.url, { method: uploadUrl.method ?? "PUT", headers: uploadUrl.headers, body: new Blob([toArrayBuffer(bytes)]) });
  }
  await request(`/photos/uploads/${encodeURIComponent(uploadId)}/complete`, {
    method: "POST",
    body: JSON.stringify({ objectKey, contentBase64: bytesToBase64(bytes), actorRole: "manager", clubId: input.clubId, federationId: input.federationId }),
  });
  return readBackendPhotoState(input.playerId, null);
}

async function readLatestApproval(playerId: string): Promise<ApprovalResponse | null> {
  const approvals = await request<readonly ApprovalResponse[]>(`/photo-approvals?registrationId=${encodeURIComponent(playerId)}`).catch(() => []);
  return approvals[approvals.length - 1] ?? null;
}

async function readVersionUrl(versionId: string): Promise<string | null> {
  const signed = await request<SignedReadResponse>(`/photos/versions/${encodeURIComponent(versionId)}/content?rendition=normalized&ttlSeconds=300`);
  return signed.signedUrl?.url ?? null;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
