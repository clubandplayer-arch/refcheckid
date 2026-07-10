import { getPhotoFeatureFlags, type MobileFeatureFlagSource } from "./photo-feature-flags";
import { OfficialPhotoCache } from "./official-photo-cache";

export type OfficialPhotoStatus = "missing" | "pending" | "active" | "rejected" | "suspended";

export interface ManagerPhotoState {
  readonly status: OfficialPhotoStatus;
  readonly currentPhotoUrl: string | null;
  readonly proposedPhotoUrl: string | null;
  readonly approvalId: string | null;
}

export interface OfficialPhotoPlayer {
  readonly id: string;
  readonly registrationId: string | null;
  readonly photoUrl?: string | null;
}

export interface OfficialPhotoRequestClient { request<T>(path: string, init?: RequestInit): Promise<T>; }
export interface NetworkState { isOnline(): boolean | Promise<boolean>; }
export interface UploadPhotoInput { playerId: string; registrationId: string; clubId: string; federationId: string; seasonId: string; bytes: Uint8Array; mimeType: string; }

interface SignedReadResponse { signedUrl?: { url?: string }; version?: { status?: string; etag?: string }; }
interface ApprovalResponse { id: string; photoVersionId: string; registrationId: string | null; requestedAt?: string; status: string; }
interface UploadIntentResponse { intent: { uploadId: string; objectKey: string; uploadUrl?: { url?: string; method?: string; headers?: Record<string, string> } }; }

export class OfficialPhotoService {
  constructor(
    private readonly client: OfficialPhotoRequestClient,
    private readonly cache: OfficialPhotoCache,
    private readonly network: NetworkState,
    private readonly flagSource?: MobileFeatureFlagSource,
    private readonly cacheTtlMs = 5 * 60 * 1000,
  ) {}

  async readPlayerPhotoState(player: OfficialPhotoPlayer): Promise<ManagerPhotoState> {
    const flags = getPhotoFeatureFlags(this.flagSource);
    const online = await this.network.isOnline();
    if (!flags.officialBackendRead || !online) {
      const cached = await this.cache.read(player.id);
      if (cached) return cached.state;
      if (flags.legacyLocalFallback && player.photoUrl) return activeState(player.photoUrl);
      return missingState();
    }

    try {
      const signed = await this.client.request<SignedReadResponse>(`/players/${encodeURIComponent(player.id)}/photo?rendition=normalized&ttlSeconds=300`);
      const currentPhotoUrl = signed.signedUrl?.url ?? null;
      const currentStatus: OfficialPhotoStatus = signed.version?.status === "suspended" ? "suspended" : currentPhotoUrl ? "active" : "missing";
      const approval = player.registrationId ? await this.readLatestApproval(player.registrationId) : null;
      const state = await this.mapBackendState(currentStatus, currentPhotoUrl, approval);
      await this.cache.write(player.id, state, this.cacheTtlMs, signed.version?.etag ?? null);
      return state;
    } catch (error) {
      const cached = await this.cache.read(player.id);
      if (cached) return cached.state;
      if (flags.legacyLocalFallback && player.photoUrl) return activeState(player.photoUrl);
      throw error;
    }
  }

  async prefetchPlayers(players: readonly OfficialPhotoPlayer[]): Promise<readonly ManagerPhotoState[]> {
    return Promise.all(players.map((player) => this.readPlayerPhotoState(player)));
  }

  async uploadOfficialPlayerPhoto(input: UploadPhotoInput): Promise<ManagerPhotoState> {
    const flags = getPhotoFeatureFlags(this.flagSource);
    if (!flags.officialBackendUpload) throw new Error("Upload backend disabilitato dal feature flag photos.officialBackendUpload.");
    if (!(await this.network.isOnline())) throw new Error("Upload ufficiale non disponibile offline: il backend ARCH-1 resta la Source of Truth.");
    const sha256 = await sha256Hex(input.bytes);
    const intentResponse = await this.client.request<UploadIntentResponse>("/photos/upload-intent", {
      method: "POST",
      body: JSON.stringify({ playerId: input.playerId, registrationId: input.registrationId, federationId: input.federationId, seasonId: input.seasonId, mimeType: input.mimeType, fileSizeBytes: input.bytes.byteLength, sha256, actorRole: "manager", clubId: input.clubId, registrationClubId: input.clubId }),
    });
    const { uploadId, objectKey, uploadUrl } = intentResponse.intent;
    if (uploadUrl?.url && uploadUrl.url.startsWith("http")) {
      const uploadResponse = await fetch(uploadUrl.url, { method: uploadUrl.method ?? "PUT", headers: uploadUrl.headers, body: new Blob([toArrayBuffer(input.bytes)]) });
      if (!uploadResponse.ok) throw new Error(`Signed upload failed with status ${uploadResponse.status}.`);
    }
    await this.client.request(`/photos/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST",
      body: JSON.stringify({ objectKey, ...(uploadUrl?.url && uploadUrl.url.startsWith("http") ? {} : { contentBase64: bytesToBase64(input.bytes) }), actorRole: "manager", clubId: input.clubId, federationId: input.federationId }),
    });
    await this.cache.invalidate(input.playerId);
    return this.readPlayerPhotoState({ id: input.playerId, registrationId: input.registrationId });
  }

  private async readLatestApproval(registrationId: string): Promise<ApprovalResponse | null> {
    const approvals = await this.client.request<readonly ApprovalResponse[]>(`/photo-approvals?registrationId=${encodeURIComponent(registrationId)}`);
    return [...approvals].sort((left, right) => (left.requestedAt ?? "").localeCompare(right.requestedAt ?? "") || left.id.localeCompare(right.id)).at(-1) ?? null;
  }

  private async mapBackendState(currentStatus: OfficialPhotoStatus, currentPhotoUrl: string | null, approval: ApprovalResponse | null): Promise<ManagerPhotoState> {
    if (!approval) return { approvalId: null, currentPhotoUrl, proposedPhotoUrl: null, status: currentStatus };
    const proposedPhotoUrl = await this.readVersionUrl(approval.photoVersionId).catch(() => null);
    if (approval.status === "pending") return { approvalId: approval.id, currentPhotoUrl, proposedPhotoUrl, status: "pending" };
    if (approval.status === "rejected") return { approvalId: approval.id, currentPhotoUrl, proposedPhotoUrl, status: "rejected" };
    return { approvalId: approval.id, currentPhotoUrl: proposedPhotoUrl ?? currentPhotoUrl, proposedPhotoUrl: null, status: "active" };
  }

  private async readVersionUrl(versionId: string): Promise<string | null> {
    const signed = await this.client.request<SignedReadResponse>(`/photos/versions/${encodeURIComponent(versionId)}/content?rendition=normalized&ttlSeconds=300`);
    return signed.signedUrl?.url ?? null;
  }
}

function missingState(): ManagerPhotoState { return { status: "missing", currentPhotoUrl: null, proposedPhotoUrl: null, approvalId: null }; }
function activeState(url: string): ManagerPhotoState { return { status: "active", currentPhotoUrl: url, proposedPhotoUrl: null, approvalId: null }; }
function bytesToBase64(bytes: Uint8Array): string { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); return copy.buffer; }
async function sha256Hex(bytes: Uint8Array): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
