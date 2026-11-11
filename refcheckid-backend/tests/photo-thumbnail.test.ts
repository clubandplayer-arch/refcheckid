import sharp from 'sharp';
import { expect, it } from 'vitest';
import { encodeThumbnail, ensurePhotoThumbnail, thumbnailKey } from '../src/services/photo-thumbnail.js';
import { LocalPhotoObjectStore } from '../src/services/photo-object-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('creates bounded private previews, preserves originals and reuses the derived file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'refcheckid-thumbs-'));
  try {
    const original = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#a12345' } }).png().toBuffer();
    const thumb = await encodeThumbnail(original);
    const metadata = await sharp(thumb).metadata();
    expect(metadata.format).toBe('webp'); expect(metadata.width).toBeLessThanOrEqual(320); expect(metadata.height).toBeLessThanOrEqual(320);
    const store = new LocalPhotoObjectStore(root);
    await store.putObject('subjects/person/original.png', original);
    const keys = await Promise.all([ensurePhotoThumbnail(store, 'subjects/person/original.png'), ensurePhotoThumbnail(store, 'subjects/person/original.png')]);
    expect(keys).toEqual([thumbnailKey('subjects/person/original.png'), thumbnailKey('subjects/person/original.png')]);
    expect(await store.readObject(keys[0])).toEqual(thumb);
    expect(await store.readObject('subjects/person/original.png')).toEqual(original);
  } finally { await rm(root, { recursive: true, force: true }); }
});
