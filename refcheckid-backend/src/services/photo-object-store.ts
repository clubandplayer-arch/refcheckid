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
}

export interface SignedPhotoReadUrlInput {
  readonly objectKey: string;
  readonly rendition: 'original' | 'normalized' | 'thumb_128' | 'thumb_320';
  readonly ttlSeconds: number;
  readonly correlationId: UUID;
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
}

export interface PhotoObjectStore {
  createUploadIntent(input: PhotoUploadIntentInput): Promise<PhotoUploadIntent>;
  confirmUploadedObject(objectKey: string): Promise<PhotoUploadedObjectConfirmation>;
  createSignedReadUrl(input: SignedPhotoReadUrlInput): Promise<SignedPhotoReadUrl>;
  quarantineObject(objectKey: string, reason: string): Promise<void>;
  deleteObjectControlled(objectKey: string, reason: string): Promise<void>;
  registerRendition(input: PhotoRenditionRegistration): Promise<void>;
}

export class StubPhotoObjectStore implements PhotoObjectStore {
  createUploadIntent(input: PhotoUploadIntentInput): Promise<PhotoUploadIntent> {
    return Promise.resolve({
      uploadId: '00000000-0000-4000-8000-000000000000',
      objectKey: input.objectKey,
      method: 'PUT',
      uploadUrl: `stub://photo-upload/${encodeURIComponent(input.objectKey)}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  }

  confirmUploadedObject(objectKey: string): Promise<PhotoUploadedObjectConfirmation> {
    return Promise.resolve({ objectKey, sha256: 'stub-sha256', fileSizeBytes: 1 });
  }

  createSignedReadUrl(input: SignedPhotoReadUrlInput): Promise<SignedPhotoReadUrl> {
    return Promise.resolve({
      url: `stub://photo-read/${input.rendition}/${encodeURIComponent(input.objectKey)}?correlationId=${input.correlationId}`,
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
    });
  }

  async quarantineObject(): Promise<void> {}
  async deleteObjectControlled(): Promise<void> {}
  async registerRendition(): Promise<void> {}
}
