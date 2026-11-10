import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readFile, copyFile, writeFile, chmod, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = process.env.REFCHECKID_DATABASE_PATH ?? join(root, 'storage/refcheckid.sqlite');
const photos = resolve(process.env.REFCHECKID_PHOTO_STORAGE_ROOT ?? join(root, 'storage/refcheckid-photos-dev'));
const destination = process.argv[2] ? resolve(process.argv[2]) : null;
if (!destination || !existsSync(source)) throw new Error('Usage: node scripts/backup-runtime.mjs NEW_BACKUP_DIRECTORY (database must exist)');
await mkdir(destination, { mode: 0o700 }); // Refuse to overwrite any existing backup.
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, join(destination, 'state.sqlite')); } finally { db.close(); }
await chmod(join(destination, 'state.sqlite'), 0o600);
const snapshot = new DatabaseSync(join(destination, 'state.sqlite'), { readOnly: true });
const hashes = {};
try {
  const integrity = snapshot.prepare('PRAGMA integrity_check').get();
  if (integrity.integrity_check !== 'ok') throw new Error('Database integrity check failed.');
  const versions = snapshot.prepare("SELECT document FROM entities WHERE repository='photo_versions'").all();
  for (const row of versions) {
    const version = JSON.parse(row.document);
    if (version.status === 'erased') continue;
    for (const key of [version.storageOriginalKey, version.storageNormalizedKey].filter(Boolean)) {
      const path = resolve(photos, key);
      if (!path.startsWith(`${photos}${sep}`)) throw new Error('Unsafe photo reference in database.');
      const target = join(destination, 'photos', key);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await copyFile(path, target);
      await chmod(target, 0o600);
      hashes[`photos/${key}`] = createHash('sha256').update(await readFile(target)).digest('hex');
    }
  }
} finally { snapshot.close(); }
const metadata = process.env.REFCHECKID_PHOTO_METADATA_ROOT ?? join(root, 'storage/refcheckid-photo-metadata-dev');
if (existsSync(metadata)) await cp(metadata, join(destination, 'legacy-photo-metadata'), { recursive: true, errorOnExist: true });
if (process.env.AUTH_USERS_FILE) {
  await copyFile(process.env.AUTH_USERS_FILE, join(destination, 'users.json'));
  await chmod(join(destination, 'users.json'), 0o600);
}
hashes['state.sqlite'] = createHash('sha256').update(await readFile(join(destination, 'state.sqlite'))).digest('hex');
await writeFile(join(destination, 'manifest.json'), JSON.stringify({ format: 1, createdAt: new Date().toISOString(), hashes }, null, 2), { mode: 0o600 });
console.log(`Verified backup created at ${destination}. Keep authentication secrets separately in the secret store.`);
