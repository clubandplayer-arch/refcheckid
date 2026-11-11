import { readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, sep, join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { postgresTlsOptions } from '../src/cloud/postgres-tls.js';
import { safeDiagnosticCode } from '../src/cloud/diagnostics.js';
import { createApplicationContainer } from '../src/config/application-container.js';
import { PhotoValidationPipeline } from '../src/services/photo-validation-pipeline.js';
import { planRosterChanges, applyRosterChanges, type RosterManifest } from '../src/services/staging-roster-restore.js';
import type { PhotoAccessContext } from '../src/services/photo-service.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const directory = args.find((arg) => !arg.startsWith('--'));
if (!directory || args.some((arg) => arg.startsWith('--') && arg !== '--apply')) throw new Error('Usage: pnpm staging:roster PHOTO_DIRECTORY [--apply]');
const root = resolve(directory);
const manifest = JSON.parse(await readFile(new URL('../../demo/restored-roster/manifest.json', import.meta.url), 'utf8')) as RosterManifest;
const pipeline = new PhotoValidationPipeline();
const files = new Map<string, Buffer>();
// Read and verify all 42 files before any remote request or mutation.
for (const subject of manifest.subjects) {
  const path = resolve(root, subject.file);
  if (!path.startsWith(root + sep)) throw new Error('Unsafe manifest path.');
  let parent = path;
  for (;;) {
    if ((await lstat(parent)).isSymbolicLink()) throw new Error('Symbolic links are not allowed in photo inputs.');
    if (parent === root) break;
    parent = resolve(parent, '..');
  }
  const bytes = await readFile(path);
  const validated = pipeline.validate({ bytes, declaredMimeType: subject.mimeType });
  if (validated.sha256 !== subject.sha256 || bytes.length !== subject.bytes || validated.width !== subject.width || validated.height !== subject.height) throw new Error(`Photo verification failed: ${subject.file}`);
  files.set(subject.personId, bytes);
}
console.log(JSON.stringify({ mode: apply ? 'apply to staging' : 'local read-only plan', photos: files.size,
  clubs: manifest.clubs.map((club) => club.after), playersPerClub: 18, staffPerClub: 3,
  retiredTechnicalStaff: 2, photoApproval: 'pending human review; existing official photos remain unchanged',
  aliases: { 'ospite/Bernanrdi.jpg': 'Massimo Bernardi' } }, null, 2));
if (apply) await applyToStaging();

async function applyToStaging() {
  if (process.env.REFCHECKID_DATA_ENV !== 'staging') throw new Error('This command is restricted to staging.');
  if (new URL(process.env.SUPABASE_URL ?? '').hostname !== `${manifest.targetProjectRef}.supabase.co`) throw new Error('Unexpected Supabase project: this migration is restricted to the prepared staging project.');
  process.env.REFCHECKID_RUNTIME = 'supabase';
  // CLI never issues browser URLs; this ephemeral value is not saved or deployed.
  process.env.AUTH_SECRET ??= randomBytes(32).toString('hex');
  const app = createApplicationContainer();
  try {
  const profileRows = await app.store.list<{ id: string; actorId: string; role: string; enabled: boolean; clubIds?: string[]; federationIds?: string[] }>('auth_profiles');
  const managers = new Map<string, typeof profileRows[number]>();
  for (const club of manifest.clubs) {
    const candidates = profileRows.filter((row) => row.enabled && row.role === 'manager' && row.clubIds?.includes(club.id) && row.federationIds?.includes(manifest.federationId));
    if (candidates.length !== 1) throw new Error('Expected exactly one enabled staging manager per club.');
    managers.set(club.id, candidates[0]);
  }
  const operator = profileRows.filter((row) => row.enabled && row.role === 'federation' && row.federationIds?.includes(manifest.federationId));
  if (operator.length !== 1) throw new Error('Expected one enabled staging federation operator.');
    // Preflight before saving a snapshot or changing records.
    await app.store.transaction(() => planRosterChanges(app.store, manifest));
    const pool = new Pool(postgresTlsOptions({ connectionString: process.env.DATABASE_URL!, max: 1 }));
    const backup = join(root, `before-roster-${Date.now()}-${randomUUID()}.json`);
    try {
      const rows = await pool.query('SELECT repository,id,document FROM refcheckid.entities ORDER BY ordinal');
      await writeFile(backup, JSON.stringify({ format: 1, createdAt: new Date().toISOString(), entities: rows.rows }, null, 2), { flag: 'wx', mode: 0o600 });
    } finally { await pool.end(); }
    console.log(`Private database snapshot saved: ${backup}`);
    await app.store.transaction(async () => {
      const changes = await planRosterChanges(app.store, manifest);
      await applyRosterChanges(app.store, changes);
      if (changes.length) await app.repositories.audit.createAuditLog({ action: 'staging.roster.restored', occurredAt: new Date().toISOString(),
        metadata: { batch: manifest.batch, operatorActorId: operator[0].actorId, source: 'operator CLI', changes } });
      console.log(`Roster metadata verified: ${changes.length} changes; identifiers preserved.`);
    });
    for (const subject of manifest.subjects) {
      const manager = managers.get(subject.clubId)!;
      const context: PhotoAccessContext = { actorId: manager.actorId, actorRole: 'manager', clubId: subject.clubId,
        clubIds: [subject.clubId], registrationClubId: subject.clubId, federationId: manifest.federationId };
      await app.store.transaction(async () => {
        const globals = await app.repositories.globalOfficialPhotos.list();
        const subjects = await app.repositories.photoSubjects.list();
        const canonical = subjects.find((row) => row.canonicalPersonId === subject.personId && row.subjectKind === subject.kind && row.deletedAt === null);
        const global = canonical ? globals.find((row) => row.photoSubjectId === canonical.id && row.deletedAt === null) : null;
        if (!global) throw new Error(`Missing original photo subject relation: ${subject.personId}`);
        const versions = await app.repositories.photoVersions.listByGlobalPhoto(global.id);
        const approvals = (await app.repositories.photoApprovals.list()).filter((row) => row.registrationId === subject.registrationId && row.deletedAt === null);
        const matching = versions.find((row) => row.sha256 === subject.sha256 && ['pending_approval', 'active'].includes(row.status) && approvals.some((approval) => approval.photoVersionId === row.id && ['pending', 'approved'].includes(approval.status)));
        if (matching) {
          const existing = await app.objectStores.photos.confirmUploadedObject(matching.storageOriginalKey);
          if (existing.sha256 !== subject.sha256) throw new Error('Existing uploaded photo checksum mismatch.');
          const normalized = await app.objectStores.photos.readObject(matching.storageNormalizedKey!);
          const expected = pipeline.validate({ bytes: files.get(subject.personId)!, declaredMimeType: subject.mimeType }).normalized;
          if (!normalized.equals(expected)) throw new Error('Existing normalized photo checksum mismatch.');
          console.log(`Verified existing proposal/photo: ${subject.file}`);
          return;
        }
        if (approvals.some((row) => row.status === 'pending')) throw new Error(`A different pending photo already exists for ${subject.file}.`);
        const intent = await app.services.photos.createUploadIntent({ subjectKind: subject.kind, subjectId: subject.personId,
          registrationId: subject.registrationId, federationId: manifest.federationId, seasonId: manifest.season,
          mimeType: subject.mimeType, fileSizeBytes: subject.bytes, sha256: subject.sha256, context });
        const version = await app.services.photos.completeUpload({ uploadId: intent.uploadId, objectKey: intent.objectKey,
          contentBase64: files.get(subject.personId)!.toString('base64'), context });
        const uploaded = await app.objectStores.photos.confirmUploadedObject(version.storageOriginalKey);
        const normalized = await app.objectStores.photos.readObject(version.storageNormalizedKey!);
        const expected = pipeline.validate({ bytes: files.get(subject.personId)!, declaredMimeType: subject.mimeType }).normalized;
        if (uploaded.sha256 !== subject.sha256 || !normalized.equals(expected)) throw new Error('Uploaded original/normalized checksum mismatch.');
        await app.repositories.audit.createAuditLog({ action: 'staging.photo.proposed', occurredAt: new Date().toISOString(),
          metadata: { batch: manifest.batch, source: 'operator CLI', operatorActorId: operator[0].actorId,
            managerActorId: manager.actorId, registrationId: subject.registrationId, photoVersionId: version.id, sha256: subject.sha256 } });
        console.log(`Photo proposal verified: ${subject.file}`);
      });
    }
    console.log('Staging roster restored: 36 named players, 6 staff, 42 photo proposals verified. No approvals, resets or photo deletions performed.');
  } catch (error) {
    // Network failures may leave unreferenced immutable files. Never delete them
    // automatically; reruns reuse verified committed versions and approvals.
    console.error('Staging restoration stopped:', safeDiagnosticCode(error));
    if (error instanceof Error && !('code' in error) && error.name !== 'TypeError') console.error(error.message);
    process.exitCode = 1;
  } finally { await app.store.close(); }
}
