// Defaults to a strictly local, read-only plan. --apply requires a verified
// immutable backup and an empty destination database. Never resets/seeds data.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { Pool } from 'pg';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const source = args.find((arg) => !arg.startsWith('--'));
if (!source || args.some((arg) => arg.startsWith('--') && arg !== '--apply')) {
  throw new Error('Usage: node --env-file-if-exists=.env scripts/supabase-transfer.mjs BACKUP_DIRECTORY [--apply]');
}
const root = resolve(source);
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
if (manifest.format !== 1 || !manifest.hashes?.['state.sqlite']) throw new Error('Invalid backup manifest.');
const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const [relative, expected] of Object.entries(manifest.hashes)) {
  const path = resolve(root, relative);
  if (!path.startsWith(root + sep) || checksum(await readFile(path)) !== expected) throw new Error(`Backup verification failed: ${relative}`);
}
const sqlite = new DatabaseSync(join(root, 'state.sqlite'), { readOnly: true });
let entities;
try {
  if (sqlite.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Invalid SQLite backup.');
  entities = sqlite.prepare('SELECT repository,id,document FROM entities ORDER BY rowid').all()
    .filter((row) => !['auth_sessions', 'photo_access_grants', 'photo_upload_sessions', 'auth_profiles'].includes(row.repository))
    .map((row) => ({ ...row, document: JSON.parse(row.document) }));
} finally { sqlite.close(); }
const photos = new Map();
for (const row of entities.filter((row) => row.repository === 'photo_versions')) {
  for (const key of [row.document.storageOriginalKey, row.document.storageNormalizedKey].filter(Boolean)) {
    if (key.startsWith('/') || key.includes('\\') || key.split('/').some((part) => !part || part === '..' || part === '.')) throw new Error('Invalid photo object key.');
    if (!manifest.hashes[`photos/${key}`]) throw new Error(`Photo missing from verified manifest: ${key}`);
    photos.set(key, manifest.hashes[`photos/${key}`]);
  }
}
const inventory = {};
for (const row of entities) inventory[row.repository] = (inventory[row.repository] ?? 0) + 1;
console.log(JSON.stringify({ mode: apply ? 'apply' : 'read-only plan', inventory, photoFiles: photos.size,
  clubs: entities.filter((row) => row.repository === 'clubs').map((row) => row.document.name),
  excluded: ['auth_sessions', 'photo_access_grants', 'photo_upload_sessions', 'auth_profiles'] }, null, 2));
if (!apply) process.exit(0);

for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVER_KEY']) if (!process.env[key]) throw new Error(`Missing ${key}`);
if (process.env.REFCHECKID_DATA_ENV !== 'staging') throw new Error('Initial transfer is restricted to staging.');
const origin = new URL(process.env.SUPABASE_URL);
if (origin.protocol !== 'https:' || origin.pathname !== '/') throw new Error('Expected an HTTPS Supabase origin.');
// Prevent accidentally uploading to a different project than the database.
const project = origin.hostname.split('.')[0];
const connection = new URL(process.env.DATABASE_URL);
if (!(connection.hostname === `db.${project}.supabase.co` || decodeURIComponent(connection.username).endsWith(`.${project}`))) {
  throw new Error('Database connection and Supabase URL do not identify the same project.');
}
if (connection.searchParams.get('sslmode') !== 'verify-full') throw new Error('DATABASE_URL requires sslmode=verify-full.');
const serverKey = process.env.SUPABASE_SERVER_KEY;
async function storage(path, init = {}) {
  const headers = { apikey: serverKey, ...(!serverKey.startsWith('sb_secret_') ? { authorization: `Bearer ${serverKey}` } : {}), ...init.headers };
  return fetch(`${origin.origin}/storage/v1${path}`, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(20_000) });
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(724391,1)');
  await client.query('LOCK TABLE refcheckid.entities IN EXCLUSIVE MODE');
  const count = await client.query('SELECT count(*)::int AS count FROM refcheckid.entities');
  if (count.rows[0].count !== 0) throw new Error('Destination is not empty. No database rows were overwritten.');
  const bucket = await storage('/bucket/refcheckid-photos');
  if (!bucket.ok || (await bucket.json()).public !== false) throw new Error('Private photo bucket is missing. Apply the migration first.');
  for (const [key, hash] of photos) {
    const path = '/object/refcheckid-photos/' + key.split('/').map(encodeURIComponent).join('/');
    let remote = await storage(path);
    if (remote.status === 404 || remote.status === 400) {
      // Upload is insert-only. Verify the result even if a concurrent upload wins.
      const bytes = await readFile(resolve(root, 'photos', key));
      const uploaded = await storage(path, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-upsert': 'false' }, body: bytes });
      if (!uploaded.ok && ![400, 409].includes(uploaded.status)) throw new Error(`Photo upload failed (${uploaded.status}).`);
      remote = await storage(path);
    }
    if (!remote.ok || checksum(Buffer.from(await remote.arrayBuffer())) !== hash) throw new Error(`Remote photo checksum mismatch: ${key}`);
  }
  for (const row of entities) {
    await client.query('INSERT INTO refcheckid.entities(repository,id,document) VALUES ($1,$2,$3::jsonb)', [row.repository, row.id, JSON.stringify(row.document)]);
  }
  const imported = await client.query('SELECT repository,id,document FROM refcheckid.entities ORDER BY ordinal');
  const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  const canonical = (value) => JSON.stringify(stable(value));
  if (imported.rows.length !== entities.length || imported.rows.some((row, index) => row.id !== entities[index].id || row.repository !== entities[index].repository || canonical(row.document) !== canonical(entities[index].document))) {
    throw new Error('Imported document verification failed.');
  }
  await client.query('COMMIT');
  console.log(`Staging transfer verified: ${entities.length} entities, ${photos.size} photo files. Existing source files remain unchanged.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  // Uploaded files may remain after a failed DB transaction; a retry verifies
  // their hashes and reuses them, never deletes or overwrites existing photos.
  console.error(error instanceof Error && !('severity' in error) ? error.message : 'Database transfer failed.');
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
