import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function backup() {
  const root = mkdtempSync(join(tmpdir(), 'refcheckid-transfer-test-')); directories.push(root);
  mkdirSync(join(root, 'photos'));
  writeFileSync(join(root, 'photos', 'original.png'), Buffer.from([1, 2, 3]));
  const db = new DatabaseSync(join(root, 'state.sqlite'));
  db.exec('CREATE TABLE entities(repository TEXT,id TEXT,document TEXT)');
  const put = db.prepare('INSERT INTO entities VALUES (?,?,?)');
  put.run('photo_versions', 'photo', JSON.stringify({ id: 'photo', storageOriginalKey: 'original.png' }));
  put.run('auth_sessions', 'session', JSON.stringify({ id: 'session', token: 'excluded' }));
  db.close();
  const hash = (file: string) => createHash('sha256').update(readFileSync(join(root, file))).digest('hex');
  const hashes = { 'state.sqlite': hash('state.sqlite'), 'photos/original.png': hash('photos/original.png') };
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ format: 1, hashes }));
  return { root, hashes, hash };
}

it('plans without credentials, excludes sessions, verifies every file and leaves the source unchanged', () => {
  const { root, hash, hashes } = backup();
  const run = spawnSync(process.execPath, [resolve('scripts/supabase-transfer.mjs'), root], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: '', SUPABASE_URL: '', SUPABASE_SERVER_KEY: '' } });
  expect(run.status).toBe(0);
  const plan = JSON.parse(run.stdout) as { mode: string; photoFiles: number; inventory: Record<string, number> };
  expect(plan.mode).toBe('read-only plan'); expect(plan.photoFiles).toBe(1);
  expect(plan.inventory).not.toHaveProperty('auth_sessions');
  expect(hash('state.sqlite')).toBe(hashes['state.sqlite']);
  writeFileSync(join(root, 'photos/original.png'), 'corrupted');
  const bad = spawnSync(process.execPath, [resolve('scripts/supabase-transfer.mjs'), root], { encoding: 'utf8' });
  expect(bad.status).not.toBe(0);
  expect(bad.stderr).toContain('Backup verification failed');
});
