import { mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { createApplicationContainer } from '../src/config/application-container.js';
import { dataset, preparedApp } from './runtime-fixtures.js';

it('restores upload intents, rejects forged object ownership and completes exactly once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'refcheckid-upload-'));
  const path = join(root, 'state.sqlite');
  vi.stubEnv('REFCHECKID_PHOTO_STORAGE_ROOT', join(root, 'photos'));
  vi.stubEnv('REFCHECKID_PHOTO_METADATA_ROOT', join(root, 'metadata'));
  const first = await preparedApp(path);
  const person = dataset.photoPlan[0];
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const context = { actorRole: 'manager' as const, actorId: '90000000-0000-4000-8000-000000000001', clubId: person.clubId, registrationClubId: person.clubId, federationId: dataset.federationSyncPayload.federations[0].id };
  const intent = await first.services.photos.createUploadIntent({ subjectKind: 'athlete', subjectId: person.subjectId, registrationId: person.registrationId,
    federationId: context.federationId, seasonId: dataset.seasonId, mimeType: 'image/png', fileSizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), context });
  first.store.close();
  const app = createApplicationContainer({ databasePath: path });
  const write = vi.spyOn(app.objectStores.photos, 'putObject');
  const complete = { uploadId: intent.uploadId, objectKey: intent.objectKey, contentBase64: bytes.toString('base64'), context };
  try {
    await expect(app.services.photos.completeUpload({ ...complete, objectKey: '../existing-photo.png' })).rejects.toThrow('does not belong');
    await expect(app.services.photos.completeUpload({ ...complete, context: { ...context, actorId: 'other-actor' } })).rejects.toThrow('does not belong');
    expect(write).not.toHaveBeenCalled();
    const version = await app.services.photos.completeUpload(complete);
    const repeated = await app.services.photos.completeUpload({ ...complete, contentBase64: Buffer.from('replacement attempt').toString('base64') });
    expect(repeated.id).toBe(version.id);
    expect(await app.repositories.photoVersions.list()).toHaveLength(1);
    expect(await app.objectStores.photos.readObject(version.storageOriginalKey)).toEqual(bytes);
    expect(await app.repositories.photoApprovals.list()).toHaveLength(1);
  } finally { write.mockRestore(); app.store.close(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); }
});
