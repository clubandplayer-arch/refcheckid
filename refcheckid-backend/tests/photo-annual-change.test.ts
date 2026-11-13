import { createHash, randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createRestApiRouter } from '../src/api/router.js';
import { createApplicationContainer } from '../src/config/application-container.js';
import type { PhotoAccessContext } from '../src/services/photo-service.js';

afterEach(() => vi.useRealTimers());
it.each(['athlete', 'staff_member'] as const)('enforces annual replacement reasons for %s at intent and approval without consuming rejected requests', async (subjectKind) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
  const app = createApplicationContainer({ seedDemo: false });
  try {
    const person = randomUUID(); const federationId = randomUUID(); const clubId = randomUUID();
    const subject = await app.repositories.photoSubjects.create({ subjectKind, canonicalPersonId: person, dedupeKeyHash: `${subjectKind}:${person}` });
    const global = await app.repositories.globalOfficialPhotos.create({ photoSubjectId: subject.id, currentVersionId: null, status: 'pending_first_approval', lastApprovedAt: null, lastChangedAt: new Date().toISOString() });
    const context: PhotoAccessContext = { actorRole: 'federation', actorId: randomUUID(), federationId };
    const manager: PhotoAccessContext = { actorRole: 'manager', actorId: randomUUID(), clubId };
    const intent = { subjectKind, subjectId: person, registrationId: randomUUID(), federationId, seasonId: '2026', mimeType: 'image/png', fileSizeBytes: 100, sha256: 'a'.repeat(64), context: manager };
    let number = 0;
    const proposal = async (reason?: string) => {
      const version = await app.repositories.photoVersions.create({ globalOfficialPhotoId: global.id, versionNumber: ++number,
        status: 'pending_approval', activatedAt: null, ...(reason ? { replacementReason: reason } : {}) });
      const approval = await app.repositories.photoApprovals.create({ photoVersionId: version.id, federationId, registrationId: intent.registrationId,
        seasonId: '2026', status: 'pending', requestedByUserId: manager.actorId, requestedAt: new Date().toISOString(), disciplineId: null,
        decidedAt: null, decidedByUserId: null, decisionReasonCode: null, decisionNotes: null, scope: 'single_registration', slaDueAt: null });
      return { version, approval, approve: () => app.services.photos.approvePhotoApproval({ approvalId: approval.id, context }) };
    };
    // Initial photo is allowed, and is not counted as the first replacement.
    await expect(app.services.photos.createUploadIntent(intent)).resolves.toHaveProperty('uploadId');
    await (await proposal()).approve();
    await expect(app.services.photos.createUploadIntent(intent)).resolves.toHaveProperty('uploadId');
    // A pending request prepared before another change cannot bypass the approval guard.
    const stale = await proposal();
    const firstChange = await proposal(); await firstChange.approve();
    await expect(stale.approve()).rejects.toThrow('già chiusa');
    expect((await app.repositories.photoApprovals.findById(stale.approval.id))?.status).toBe('cancelled');
    await expect(app.services.photos.createUploadIntent(intent)).rejects.toThrow('motivazione');
    await expect(app.services.photos.createUploadIntent({ ...intent, replacementReason: 'capelli' })).rejects.toThrow('motivazione');
    const reason = 'Crescita fisica rilevante: il volto non è più riconoscibile nella foto precedente.';
    await expect(app.services.photos.createUploadIntent({ ...intent, replacementReason: reason })).resolves.toHaveProperty('uploadId');
    const router = createRestApiRouter(app);
    const apiRequest = { method: 'POST' as const, path: '/api/v1/photos/upload-intent', headers: {}, query: {},
      auth: { actorId: context.actorId, roles: ['admin'] } };
    expect((await router.handle({ ...apiRequest, body: intent })).status).toBe(409);
    expect((await router.handle({ ...apiRequest, body: { ...intent, replacementReason: reason } })).status).toBe(202);
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');
    const motivatedIntent = await app.services.photos.createUploadIntent({ ...intent,
      replacementReason: reason, fileSizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    const motivatedVersion = await app.services.photos.completeUpload({ uploadId: motivatedIntent.uploadId,
      objectKey: motivatedIntent.objectKey, contentBase64: bytes.toString('base64'), context: manager });
    expect(motivatedVersion.replacementReason).toBe(reason);
    const motivatedApproval = (await app.repositories.photoApprovals.list()).find((row) => row.photoVersionId === motivatedVersion.id);
    expect(motivatedApproval).toMatchObject({ replacementReason: reason, additionalAnnualChange: true, status: 'pending' });
    number = motivatedVersion.versionNumber;
    const denied = await proposal(reason);
    await app.services.photos.rejectPhotoApproval({ approvalId: denied.approval.id, context, notes: 'Motivo non sufficiente' });
    expect((await app.repositories.globalOfficialPhotos.findById(global.id))?.currentVersionId).toBe(firstChange.version.id);
    const exception = await proposal(reason); await exception.approve();
    expect((await app.repositories.globalOfficialPhotos.findById(global.id))?.currentVersionId).toBe(exception.version.id);
    expect((await app.repositories.photoVersions.findById(exception.version.id))?.replacementReason).toBe(reason);
    // A new season/club cannot reset the person's annual allowance.
    await expect(app.services.photos.createUploadIntent({ ...intent, seasonId: '2027', context: { ...manager, clubId: randomUUID() } })).rejects.toThrow('motivazione');
    vi.setSystemTime(new Date('2027-01-01T12:00:00.000Z'));
    await expect(app.services.photos.createUploadIntent({ ...intent, seasonId: '2027' })).resolves.toHaveProperty('uploadId');
  } finally { await app.store.close(); }
});
