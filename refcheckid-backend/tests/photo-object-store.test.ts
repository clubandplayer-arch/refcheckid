import { describe, expect, it } from 'vitest';
import { LocalPhotoObjectStore } from '../src/services/photo-object-store.js';

describe('LocalPhotoObjectStore defaults', () => {
  it('keeps automated test objects outside the dev runtime photo bucket', async () => {
    const store = new LocalPhotoObjectStore();
    const intent = await store.createUploadIntent({
      objectKey: 'regression/photo.txt',
      mimeType: 'text/plain',
      fileSizeBytes: 5,
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    });

    expect(intent.uploadUrl).not.toContain('/storage/refcheckid-photos-dev/');
  });
});
