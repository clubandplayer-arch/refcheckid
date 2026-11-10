import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, sep } from 'node:path';

if (!process.argv[2]) throw new Error('Usage: node scripts/verify-backup.mjs BACKUP_DIRECTORY');
const root = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
if (manifest.format !== 1 || !manifest.hashes || !manifest.hashes['state.sqlite']) throw new Error('Invalid backup manifest');
for (const [relative, expected] of Object.entries(manifest.hashes)) {
  const path = resolve(root, relative);
  if (!path.startsWith(`${root}${sep}`)) throw new Error('Unsafe backup path');
  const actual = createHash('sha256').update(await readFile(path)).digest('hex');
  if (actual !== expected) throw new Error(`Backup checksum mismatch: ${relative}`);
}
const db = new DatabaseSync(join(root, 'state.sqlite'), { readOnly: true });
try {
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Invalid database');
} finally { db.close(); }
console.log(`Backup verified: ${Object.keys(manifest.hashes).length} files.`);
