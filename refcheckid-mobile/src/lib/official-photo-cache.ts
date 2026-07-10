import type { ManagerPhotoState } from "./official-photo-service";

export interface CachedOfficialPhoto {
  readonly state: ManagerPhotoState;
  readonly cachedAt: number;
  readonly expiresAt: number;
  readonly etag: string | null;
}

export interface OfficialPhotoCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class MemoryOfficialPhotoCacheStorage implements OfficialPhotoCacheStorage {
  private readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async removeItem(key: string): Promise<void> { this.values.delete(key); }
}

export class OfficialPhotoCache {
  constructor(private readonly storage: OfficialPhotoCacheStorage, private readonly now: () => number = () => Date.now()) {}

  async read(playerId: string): Promise<CachedOfficialPhoto | null> {
    const raw = await this.storage.getItem(cacheKey(playerId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedOfficialPhoto;
    if (cached.expiresAt <= this.now()) {
      await this.invalidate(playerId);
      return null;
    }
    return cached;
  }

  async write(playerId: string, state: ManagerPhotoState, ttlMs: number, etag: string | null = null): Promise<void> {
    await this.storage.setItem(cacheKey(playerId), JSON.stringify({ state, cachedAt: this.now(), expiresAt: this.now() + ttlMs, etag } satisfies CachedOfficialPhoto));
  }

  async invalidate(playerId: string): Promise<void> { await this.storage.removeItem(cacheKey(playerId)); }
}

function cacheKey(playerId: string): string { return `arch1:official-photo:${playerId}`; }
