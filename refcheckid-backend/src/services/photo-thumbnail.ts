import sharp from 'sharp';
import type { PhotoObjectStore } from './photo-object-store.js';
import { SupabaseRequestError } from '../cloud/supabase-http.js';

const pending = new WeakMap<PhotoObjectStore, Map<string, Promise<string>>>();
export function thumbnailKey(originalKey: string): string { return `${originalKey}.thumb_320.v1.webp`; }

export async function encodeThumbnail(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { limitInputPixels: 40_000_000 }).rotate()
    .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 }).toBuffer();
}

function absent(error: unknown): boolean {
  return (error instanceof SupabaseRequestError && [400, 404].includes(error.status)) ||
    (error instanceof Error && 'code' in error && error.code === 'ENOENT');
}

/** Immutable, private derived file; original and official version are untouched. */
export function ensurePhotoThumbnail(store: PhotoObjectStore, originalKey: string): Promise<string> {
  const key = thumbnailKey(originalKey);
  let jobs = pending.get(store);
  if (!jobs) { jobs = new Map(); pending.set(store, jobs); }
  const existing = jobs.get(key);
  if (existing) return existing;
  const job = (async () => {
    if (!store.readObject || !store.putObject) throw new Error('Thumbnail storage unavailable.');
    try { await store.readObject(key); return key; }
    catch (error) { if (!absent(error)) throw error; }
    const bytes = await encodeThumbnail(await store.readObject(originalKey));
    try { await store.putObject(key, bytes); }
    catch (error) {
      // A second instance may have created the immutable derived file first.
      if (!absent(error) && !(error instanceof SupabaseRequestError && error.status === 409)) throw error;
      await store.readObject(key);
    }
    return key;
  })();
  jobs.set(key, job);
  void job.finally(() => jobs.delete(key)).catch(() => undefined);
  return job;
}
