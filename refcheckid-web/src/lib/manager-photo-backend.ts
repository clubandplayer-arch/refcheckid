import { request, ApiRequestError } from "./api-client";
import {getCurrentManagerConfig} from "./manager-team";
import type { ManagerTeam } from "./manager-team";
import { getPhotoFeatureFlags } from "./photo-feature-flags";
import type { PlayerListItem, StaffListItem } from "./types";

export type OfficialPhotoStatus =
  "missing" | "pending" | "active" | "rejected" | "suspended" | "loading" | "unavailable";

export interface ManagerPhotoState {
  readonly receivedAt?:number;
  readonly requiresReplacementReason?:boolean;
  readonly status: OfficialPhotoStatus;
  readonly currentPhotoUrl: string | null;
  readonly proposedPhotoUrl: string | null;
  readonly approvalId: string | null;
}

interface SignedReadResponse {
  requiresReplacementReason?:boolean;
  approvalId?: string | null;
  proposedPhotoUrl?: string | null;
  proposedVersionId?: string | null;
  signedUrl?: { url?: string };
  status?: OfficialPhotoStatus | string | null;
  version?: { id?: string; status?: string };
}
interface UploadIntentResponse {
  intent: {
    uploadId: string;
    objectKey: string;
    uploadUrl?: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
    };
  };
}

export async function enrichPlayersWithBackendPhotos(
  team: ManagerTeam,
  players: readonly PlayerListItem[],
): Promise<readonly PlayerListItem[]> {
  const flags = getPhotoFeatureFlags();
  if (!flags.officialBackendRead) return players;
  const photos=await batchPhotoStates(players.map(player=>player.registrationId));
  return players.map(player=>{const photo=photos.get(player.registrationId??'')??{...missingPhotoState(null),status:'unavailable' as const};return {...player,photo,photoUrl:photo.currentPhotoUrl};});
}

export async function enrichStaffWithBackendStatus(
  team: ManagerTeam,
  staff: readonly StaffListItem[],
): Promise<readonly StaffListItem[]> {
  const flags = getPhotoFeatureFlags();
  if (!flags.officialBackendRead) {
    return staff.map((member) => ({
      ...member,
      photo: {
        status: member.photoUrl ? "active" : "missing",
        currentPhotoUrl: member.photoUrl,
        proposedPhotoUrl: null,
        approvalId: null,
      },
    }));
  }
  const photos=await batchPhotoStates(staff.map(member=>member.registrationId));
  return staff.map(member=>{const photo=photos.get(member.registrationId??'')??{...missingPhotoState(null),status:'unavailable' as const};return {...member,photo,photoUrl:photo.currentPhotoUrl};});
}

export async function readBackendPhotoState(
  subjectKind: "athlete" | "staff_member",
  subjectId: string,
  registrationId: string | null,
): Promise<ManagerPhotoState> {
  try {
    const signed = registrationId
      ? await request<SignedReadResponse>(
          `/registrations/${encodeURIComponent(registrationId)}/season-photo?rendition=normalized&ttlSeconds=300`,
        )
      : await readSubjectPhoto(subjectKind, subjectId);
    const responseStatus = normalizeOfficialPhotoStatus(signed.status);
    const proposedPhotoUrl =
      normalizeBrowserPhotoUrl(signed.proposedPhotoUrl) ??
      photoVersionContentUrl(signed.proposedVersionId);
    const currentPhotoUrl =
      responseStatus === "pending" && proposedPhotoUrl !== null
        ? null
        : normalizeBrowserPhotoUrl(signed.signedUrl?.url) ??
          photoVersionContentUrl(signed.version?.id);
    const currentStatus =
      responseStatus === "pending" || proposedPhotoUrl !== null
        ? "pending"
        : responseStatus ??
          (signed.version?.status === "suspended"
            ? "suspended"
            : signed.version?.status === "active" || currentPhotoUrl
              ? "active"
              : "missing");
    return {
      requiresReplacementReason:signed.requiresReplacementReason??false,
      approvalId: signed.approvalId ?? null,
      currentPhotoUrl,
      proposedPhotoUrl,
      status: currentStatus,
    };
  } catch(error) {
    return error instanceof ApiRequestError&&error.status===404?missingPhotoState(null):{...missingPhotoState(null),status:"unavailable"};
  }
}

export async function uploadOfficialSubjectPhoto(input: {
  subjectKind: "athlete" | "staff_member";
  subjectId: string;
  registrationId: string;
  clubId: string;
  federationId: string;
  seasonId: string;
  dataUrl: string;
  replacementReason?: string;
  mimeType?: string;
}): Promise<ManagerPhotoState> {
  const flags = getPhotoFeatureFlags();
  if (!flags.officialBackendUpload)
    throw new Error(
      "Upload backend disabilitato dal feature flag photos.officialBackendUpload.",
    );
  const bytes = dataUrlToBytes(input.dataUrl);
  const mimeType =
    input.mimeType ??
    input.dataUrl.match(/^data:([^;]+);/)?.[1] ??
    "image/jpeg";
  const sha256 = await sha256Hex(bytes);
  const intentResponse = await request<UploadIntentResponse>(
    "/photos/upload-intent",
    {
      method: "POST",
      body: JSON.stringify({
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        ...(input.subjectKind === "athlete"
          ? { playerId: input.subjectId }
          : { staffMemberId: input.subjectId }),
        registrationId: input.registrationId,
        federationId: input.federationId,
        seasonId: input.seasonId,
        mimeType,
        fileSizeBytes: bytes.byteLength,
        sha256,
        ...(input.replacementReason?.trim() ? { replacementReason: input.replacementReason.trim() } : {}),
        actorRole: "manager",
        clubId: input.clubId,
        registrationClubId: input.clubId,
      }),
    },
  );
  const { uploadId, objectKey, uploadUrl } = intentResponse.intent;
  if (uploadUrl?.url && uploadUrl.url.startsWith("http")) {
    const uploadResponse = await fetch(uploadUrl.url, {
      method: uploadUrl.method ?? "PUT",
      headers: uploadUrl.headers,
      body: new Blob([toArrayBuffer(bytes)]),
    });
    if (!uploadResponse.ok) {
      throw new Error(
        `Signed upload failed with status ${uploadResponse.status}.`,
      );
    }
  }
  await request(`/photos/uploads/${encodeURIComponent(uploadId)}/complete`, {
    method: "POST",
    body: JSON.stringify({
      objectKey,
      ...(uploadUrl?.url && uploadUrl.url.startsWith("http")
        ? {}
        : { contentBase64: bytesToBase64(bytes) }),
      actorRole: "manager",
      clubId: input.clubId,
      federationId: input.federationId,
    }),
  });
  return (await batchPhotoStates([input.registrationId],input.clubId)).get(input.registrationId)??readBackendPhotoState(input.subjectKind,input.subjectId,input.registrationId);
}

export function uploadOfficialPlayerPhoto(input: {
  playerId: string;
  registrationId: string;
  clubId: string;
  federationId: string;
  seasonId: string;
  dataUrl: string;
  mimeType?: string;
}): Promise<ManagerPhotoState> {
  return uploadOfficialSubjectPhoto({
    ...input,
    subjectKind: "athlete",
    subjectId: input.playerId,
  });
}

async function readSubjectPhoto(
  subjectKind: "athlete" | "staff_member",
  subjectId: string,
): Promise<SignedReadResponse> {
  const endpoint = subjectKind === "staff_member" ? "staff-members" : "players";
  return request<SignedReadResponse>(
    `/${endpoint}/${encodeURIComponent(subjectId)}/photo?rendition=normalized&ttlSeconds=300`,
  );
}

function photoVersionContentUrl(versionId: string | null | undefined): string | null {
  if (!versionId) return null;
  return `/api/v1/photos/versions/${encodeURIComponent(versionId)}/content?rendition=normalized`;
}

function normalizeBrowserPhotoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.startsWith("file://")) return null;
  return value;
}

function normalizeOfficialPhotoStatus(value: unknown): OfficialPhotoStatus | null {
  return value === "missing" ||
    value === "pending" ||
    value === "active" ||
    value === "rejected" ||
    value === "suspended"
    ? value
    : null;
}

function missingPhotoState(currentPhotoUrl: string | null): ManagerPhotoState {
  return {
    approvalId: null,
    currentPhotoUrl,
    proposedPhotoUrl: null,
    status: currentPhotoUrl ? "active" : "missing",
  };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function batchPhotoStates(ids:readonly (string|null)[],clubId=getCurrentManagerConfig().clubId){
 const registrations=ids.filter((id):id is string=>!!id);
 const result=new Map<string,ManagerPhotoState>();
 for(let index=0;index<registrations.length;index+=100){
  try{const response=await request<{items:(ManagerPhotoState&{registrationId:string})[]}>(`/platform/club-photo-roster/${encodeURIComponent(clubId)}?registrations=${encodeURIComponent(registrations.slice(index,index+100).join(','))}`);for(const row of response.items)result.set(row.registrationId,{...row,receivedAt:Date.now(),currentPhotoUrl:normalizeBrowserPhotoUrl(row.currentPhotoUrl),proposedPhotoUrl:normalizeBrowserPhotoUrl(row.proposedPhotoUrl)});}catch{/* Unknown is not missing: uploads remain disabled until policy can be read. */}
 }
 return result;
}
