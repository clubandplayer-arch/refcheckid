import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
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


it('reuses repeated permission reads only within a transaction and invalidates them after writes', async () => {
  const { db, store } = await setup();
  await store.transaction(async () => {
    await store.put('clubs', { id: 'home', name: 'Home' });
  });
  const query = vi.spyOn(db, 'query');
  await store.transaction(async () => {
    const [first, second] = await Promise.all([
      store.get<{ id: string; name: string }>('clubs', 'home'),
      store.get<{ id: string; name: string }>('clubs', 'home'),
    ]);
    expect(first?.name).toBe('Home'); expect(second?.name).toBe('Home');
    first!.name = 'local mutation';
    expect((await store.get<{ name: string }>('clubs', 'home'))?.name).toBe('Home');
    await store.list('clubs');
    await store.list('clubs');
    await store.get('clubs', 'home');
    const selects = () => query.mock.calls.filter(([sql]) => sql.startsWith('SELECT document'));
    expect(selects()).toHaveLength(2);
    await store.put('clubs', { id: 'home', name: 'Changed' });
    expect((await store.get<{ name: string }>('clubs', 'home'))?.name).toBe('Changed');
    expect((await store.list<{ name: string }>('clubs'))[0].name).toBe('Changed');
    expect(selects()).toHaveLength(4);
  });
  // A subsequent command must observe changes made after the previous request.
  await db.query(`UPDATE refcheckid.entities SET document='{"id":"home","name":"External"}' WHERE repository='clubs'`);
  await store.transaction(async () => {
    expect((await store.get<{ name: string }>('clubs', 'home'))?.name).toBe('External');
  });
  query.mockRestore();
});
