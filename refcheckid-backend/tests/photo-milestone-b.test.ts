import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApplicationContainer } from '../src/config/application-container.js';
import { PhotoPolicyEngine, PhotoValidationPipeline } from '../src/services/index.js';

const oneByOnePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);
const actorId = '00000000-0000-4000-8000-000000000001';
const clubId = '00000000-0000-4000-8000-000000000002';
const federationId = '00000000-0000-4000-8000-000000000003';
const playerId = '00000000-0000-4000-8000-000000000004';
const registrationId = '00000000-0000-4000-8000-000000000005';

describe('ARCH-1 Milestone B photo core', () => {
  it('creates upload intent, validates completion, strips EXIF, hashes and signs URLs', async () => {
    const container = createApplicationContainer();
    const sha256 = createHash('sha256').update(oneByOnePng).digest('hex');
    const intent = await container.services.photos.createUploadIntent({
      playerId,
      registrationId,
      federationId,
      seasonId: '2026',
      mimeType: 'image/png',
      fileSizeBytes: oneByOnePng.length,
      sha256,
      context: { actorRole: 'manager', actorId, clubId, registrationClubId: clubId, federationId },
    });

    const version = await container.services.photos.completeUpload({
      uploadId: intent.uploadId,
      objectKey: intent.objectKey,
      contentBase64: oneByOnePng.toString('base64'),
      context: { actorRole: 'manager', actorId, clubId, federationId },
    });

    expect(version.validationStatus).toBe('valid');
    expect(version.sha256).toBe(sha256);
    expect(version.perceptualHash).toHaveLength(16);
    expect(version.exifStripped).toBe(true);

    const signed = await container.services.photos.createSignedReadUrl(
      version.id,
      { actorRole: 'admin', actorId },
      { ttlSeconds: 120, rendition: 'normalized' },
    );
    expect(signed.signedUrl.url).toContain('signature=');
    expect(signed.rendition).toBe('normalized');
  });

  it('centralizes upload authorization in the policy engine', () => {
    const policy = new PhotoPolicyEngine();
    expect(policy.canUpload({ actorRole: 'manager', actorId, clubId }, clubId, federationId)).toBe(
      true,
    );
    expect(
      policy.canUpload(
        { actorRole: 'manager', actorId, clubId },
        '00000000-0000-4000-8000-000000000006',
        federationId,
      ),
    ).toBe(false);
  });

  it('rejects invalid magic bytes and MIME mismatches', () => {
    const pipeline = new PhotoValidationPipeline();
    expect(() =>
      pipeline.validate({ bytes: Buffer.from('not-image'), declaredMimeType: 'image/jpeg' }),
    ).toThrow('Unsupported image magic bytes');
    expect(() => pipeline.validate({ bytes: oneByOnePng, declaredMimeType: 'image/jpeg' })).toThrow(
      'Declared MIME type',
    );
  });
});
