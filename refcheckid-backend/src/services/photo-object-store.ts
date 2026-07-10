import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { UUID } from '../domain/index.js';

export interface PhotoUploadIntentInput {
  readonly objectKey: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly sha256: string;
}
export interface PhotoUploadIntent {
  readonly uploadId: UUID;
  readonly objectKey: string;
  readonly method: 'PUT' | 'POST';
  readonly uploadUrl: string;
  readonly expiresAt: string;
}
export interface PhotoUploadedObjectConfirmation {
  readonly objectKey: string;
  readonly sha256: string;
  readonly fileSizeBytes: number;
  readonly bytes?: Buffer;
}
export interface SignedPhotoReadUrlInput {
  readonly objectKey: string;
  readonly rendition: 'original' | 'normalized' | 'thumb_128' | 'thumb_320';
  readonly ttlSeconds: number;
  readonly correlationId: UUID;
  readonly disposition?: 'inline' | 'attachment';
}
export interface SignedPhotoReadUrl {
  readonly url: string;
  readonly expiresAt: string;
}
export interface PhotoRenditionRegistration {
  readonly sourceObjectKey: string;
  readonly renditionObjectKey: string;
  readonly rendition: 'normalized' | 'thumb_128' | 'thumb_320';
  readonly mimeType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes?: Buffer;
}
export interface PhotoObjectStore {
  createUploadIntent(input: PhotoUploadIntentInput): Promise<PhotoUploadIntent>;
  confirmUploadedObject(objectKey: string): Promise<PhotoUploadedObjectConfirmation>;
  createSignedReadUrl(input: SignedPhotoReadUrlInput): Promise<SignedPhotoReadUrl>;
  quarantineObject(objectKey: string, reason: string): Promise<void>;
  deleteObjectControlled(objectKey: string, reason: string): Promise<void>;
  registerRendition(input: PhotoRenditionRegistration): Promise<void>;
  putObject?(objectKey: string, bytes: Buffer): Promise<void>;
}

export class LocalPhotoObjectStore implements PhotoObjectStore {
  constructor(private readonly root = join(process.cwd(), 'storage', 'refcheckid-photos-dev')) {}

  async createUploadIntent(input: PhotoUploadIntentInput): Promise<PhotoUploadIntent> {
    const uploadId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await mkdir(dirname(this.pathFor(input.objectKey)), { recursive: true });
    await writeFile(
      `${this.pathFor(input.objectKey)}.intent.json`,
      JSON.stringify({ ...input, uploadId, expiresAt }),
    );
    return {
      uploadId,
      objectKey: input.objectKey,
      method: 'PUT',
      uploadUrl: `file://${this.pathFor(input.objectKey)}?uploadId=${uploadId}`,
      expiresAt,
    };
  }

  async putObject(objectKey: string, bytes: Buffer): Promise<void> {
    await mkdir(dirname(this.pathFor(objectKey)), { recursive: true });
    await writeFile(this.pathFor(objectKey), bytes);
  }

  async confirmUploadedObject(objectKey: string): Promise<PhotoUploadedObjectConfirmation> {
    const bytes = await readFile(this.pathFor(objectKey));
    return {
      objectKey,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      fileSizeBytes: (await stat(this.pathFor(objectKey))).size,
      bytes,
    };
  }

  createSignedReadUrl(input: SignedPhotoReadUrlInput): Promise<SignedPhotoReadUrl> {
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
    const token = createHash('sha256')
      .update(`${input.objectKey}:${input.correlationId}:${expiresAt}`)
      .digest('hex');
    return Promise.resolve({
      url: `file://${this.pathFor(input.objectKey)}?rendition=${input.rendition}&expiresAt=${encodeURIComponent(expiresAt)}&disposition=${input.disposition ?? 'inline'}&signature=${token}`,
      expiresAt,
    });
  }

  async quarantineObject(objectKey: string): Promise<void> {
    await mkdir(join(this.root, 'quarantine'), { recursive: true });
    await rename(
      this.pathFor(objectKey),
      join(this.root, 'quarantine', encodeURIComponent(objectKey)),
    );
  }
  async deleteObjectControlled(objectKey: string): Promise<void> {
    await rm(this.pathFor(objectKey), { force: true });
  }
  async registerRendition(input: PhotoRenditionRegistration): Promise<void> {
    if (input.bytes) await this.putObject(input.renditionObjectKey, input.bytes);
  }
  private pathFor(objectKey: string): string {
    return join(this.root, objectKey);
  }
}

export class StubPhotoObjectStore extends LocalPhotoObjectStore {}
