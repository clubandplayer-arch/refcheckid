import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { afterEach, expect, it } from 'vitest';
import { PostgresStore } from '../src/cloud/postgres-store.js';
import { DrizzleRepository } from '../src/repositories/base-repository.js';

const databases: PGlite[] = [];
afterEach(async () => { for (const db of databases.splice(0)) await db.close(); });

async function setup() {
  const db = new PGlite(); databases.push(db);
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);`);
  await db.exec(await readFile(new URL('../../supabase/migrations/202611100001_runtime.sql', import.meta.url), 'utf8'));
  const client = { query: (sql: string, args?: unknown[]) => db.query(sql, args), release() {} };
  const pool = { ...client, connect() { return Promise.resolve(client); }, on() {}, async end() {} } as unknown as Pool;
  return { db, store: new PostgresStore({}, pool) };
}

it('commits related repositories atomically, preserves IDs/order and rolls back failed commands', async () => {
  const { store } = await setup();
  const repo = new DrizzleRepository<{ id: string; createdAt: string; name: string }>({ tableName: 'players' });
  repo.bindStore(store);
  await store.transaction(async () => {
    await repo.create({ id: 'first', name: 'Uno' });
    await store.transaction(async () => { await repo.create({ id: 'second', name: 'Due' }); });
  });
  await expect(store.transaction(async () => {
    await repo.update('first', { name: 'changed' });
    await store.put('photo_approvals', { id: 'approval', status: 'approved' });
    throw new Error('simulated failure');
  })).rejects.toThrow('simulated failure');
  expect((await repo.list()).map((row) => row.name)).toEqual(['Uno', 'Due']);
  expect(await store.get('photo_approvals', 'approval')).toBeNull();
  await expect(store.put('players', { id: 'unsafe' })).rejects.toThrow('transaction');
  expect(() => store.initialize('players', [{ id: 'seed' }])).toThrow('explicitly');
});

it('blocks browser roles from private entities and keeps the photo bucket private', async () => {
  const { db, store } = await setup();
  await store.transaction(async () => { await store.put('auth_profiles', { id: 'secret-profile' }); });
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query('SELECT * FROM refcheckid.entities')).rejects.toThrow(/permission denied/);
    await db.exec('RESET ROLE');
  }
  expect((await db.query<{ public: boolean }>('SELECT public FROM storage.buckets')).rows[0].public).toBe(false);
  await expect(db.query(`INSERT INTO refcheckid.entities(repository,id,document) VALUES ('players','a','{"id":"b"}')`)).rejects.toThrow();
});
