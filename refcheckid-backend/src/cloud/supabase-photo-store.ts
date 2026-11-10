import { createHash, randomUUID } from 'node:crypto';
import type { PhotoObjectStore, PhotoUploadIntentInput, SignedPhotoReadUrlInput, PhotoRenditionRegistration } from '../services/photo-object-store.js';
import { supabaseRequest } from './supabase-http.js';

function objectPath(key: string): string {
  if (!key || key.startsWith('/') || key.includes('\\') || key.includes('\0') || key.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid photo object key.');
  }
  return key.split('/').map(encodeURIComponent).join('/');
}

export class SupabasePhotoObjectStore implements PhotoObjectStore {
  private readonly bucket = 'refcheckid-photos';

  async createUploadIntent(input: PhotoUploadIntentInput) {
    const path = `${this.bucket}/${objectPath(input.objectKey)}`;
    const data = await (await supabaseRequest(`/storage/v1/object/upload/sign/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json() as { url: string };
    if (!data.url?.startsWith('/object/upload/sign/')) throw new Error('Invalid signed upload response.');
    return { uploadId: randomUUID(), objectKey: input.objectKey, method: 'PUT' as const,
      uploadUrl: `${process.env.SUPABASE_URL}/storage/v1${data.url}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
  }

  async readObject(key: string): Promise<Buffer> {
    const response = await supabaseRequest(`/storage/v1/object/${this.bucket}/${objectPath(key)}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async putObject(key: string, bytes: Buffer): Promise<void> {
    await supabaseRequest(`/storage/v1/object/${this.bucket}/${objectPath(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-upsert': 'false' },
      body: new Uint8Array(bytes),
    });
  }

  async confirmUploadedObject(objectKey: string) {
    const bytes = await this.readObject(objectKey);
    return { objectKey, bytes, fileSizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  async createSignedReadUrl(input: SignedPhotoReadUrlInput) {
    const ttl = Math.max(1, Math.min(input.ttlSeconds, 900));
    const data = await (await supabaseRequest(`/storage/v1/object/sign/${this.bucket}/${objectPath(input.objectKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: ttl }),
    })).json() as { signedURL: string };
    if (!data.signedURL?.startsWith('/object/sign/')) throw new Error('Invalid signed read response.');
    return { url: `${process.env.SUPABASE_URL}/storage/v1${data.signedURL}`,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  async registerRendition(input: PhotoRenditionRegistration): Promise<void> {
    if (input.bytes) await this.putObject(input.renditionObjectKey, input.bytes);
  }

  async quarantineObject(key: string): Promise<void> {
    objectPath(key);
    await supabaseRequest('/storage/v1/object/move', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bucketId: this.bucket,
        sourceKey: key, destinationKey: `quarantine/${key}` }) });
  }

  async deleteObjectControlled(key: string): Promise<void> {
    objectPath(key);
    await supabaseRequest(`/storage/v1/object/${this.bucket}`, { method: 'DELETE',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: [key] }) });
  }
}
