import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { PostgresStore } from '../src/cloud/postgres-store.js';
import { DrizzleRepository } from '../src/repositories/base-repository.js';

// PGlite's cold WASM start is slower under V8 coverage on shared CI workers.
vi.setConfig({testTimeout:20000});
const databases: PGlite[] = [];
afterEach(async () => { for (const db of databases.splice(0)) await db.close(); });

async function setup() {
  const db = new PGlite(); databases.push(db);
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);`);
  await db.exec(await readFile(new URL('../../supabase/migrations/202611100001_runtime.sql', import.meta.url), 'utf8'));
  let executing = false;
  const client = { async query(sql: string, args?: unknown[]) {
    if (executing) throw new Error('Overlapping queries on one PostgreSQL client');
    executing = true;
    try { return await db.query(sql, args); }
    finally { executing = false; }
  }, release() {} };
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


it('serializes parallel repository operations on one connection and drains failed work before rollback', async () => {
  const { store } = await setup();
  await store.transaction(async () => {
    await Promise.all([
      store.put('clubs', { id: 'home' }),
      store.put('clubs', { id: 'away' }),
      store.put('players', { id: 'player' }),
    ]);
    const result = await Promise.all([store.list('clubs'), store.get('players', 'player')]);
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toEqual({ id: 'player' });
  });
  await expect(store.transaction(async () => {
    await Promise.all([
      store.put('clubs', { id: 'rolled-back' }),
      store.put('invalid_repository!', { id: 'invalid' }),
      store.put('clubs', { id: 'queued-after-failure' }),
    ]);
  })).rejects.toThrow();
  expect(await store.get('clubs', 'rolled-back')).toBeNull();
  expect(await store.get('clubs', 'queued-after-failure')).toBeNull();
});

it('rolls back a command even when its operation catches a failed SQL statement', async () => {
  const { store } = await setup();
  await expect(store.transaction(async () => {
    await store.put('clubs', { id: 'rolled-back' });
    await store.put('invalid_repository!', { id: 'invalid' }).catch(() => undefined);
    return 'must not report success';
  })).rejects.toThrow();
  expect(await store.get('clubs', 'rolled-back')).toBeNull();
});

it('keeps photo queue read transactions read-only and outside the global command lock', async () => {
  const { db, store } = await setup();
  const query = vi.spyOn(db, 'query');
  await store.readTransaction(async () => {
    expect(await store.list('clubs')).toEqual([]);
    await expect(store.put('clubs', { id: 'forbidden' })).rejects.toThrow('read-only');
  });
  expect(query.mock.calls.some(([sql]) => sql === 'BEGIN READ ONLY')).toBe(true);
  expect(query.mock.calls.some(([sql]) => sql.includes('pg_advisory_xact_lock'))).toBe(false);
  expect(await store.get('clubs', 'forbidden')).toBeNull();
  query.mockRestore();
});

it('batches import writes atomically, prefetches missing keys and exposes buffered changes consistently', async()=>{
  const {db,store}=await setup();const query=vi.spyOn(db,'query');
  await store.bulkTransaction(async()=>{
    await store.prefetch(Array.from({length:100},(_,i)=>({repository:'platform_people',id:`person-${i}`})));
    for(let i=0;i<100;i++){
      expect(await store.get('platform_people',`person-${i}`)).toBeNull();
      await store.put('platform_people',{id:`person-${i}`,clubId:'club',active:true});
      expect(await store.get('platform_people',`person-${i}`)).toHaveProperty('active',true);
    }
    expect(await store.find('platform_people',{active:true})).toHaveLength(100);
    await store.put('platform_people',{id:'person-0',clubId:'club',active:false});
    expect(await store.find('platform_people',{active:true})).toHaveLength(99);
    expect(await store.list('platform_people')).toHaveLength(100);
  });
  expect(query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO refcheckid.entities'))).toHaveLength(1);
  expect(query.mock.calls.filter(([sql])=>sql.startsWith('SELECT document FROM refcheckid.entities WHERE repository=$1 AND id=$2'))).toHaveLength(0);
  await expect(store.bulkTransaction(async()=>{await store.put('platform_people',{id:'person-0',active:true});throw new Error('cancel block');})).rejects.toThrow('cancel block');
  expect(await store.get('platform_people','person-0')).toHaveProperty('active',false);
  expect(await store.findMany('platform_people','clubId',['club'])).toHaveLength(100);
});

it('pages the event archive by descending revision inside one fixture without exposing another fixture',async()=>{
 const{store}=await setup();await store.bulkTransaction(async()=>{for(let revision=1;revision<=110;revision++)await store.put('platform_updates',{id:`update-${revision}`,fixtureId:'authorized-fixture',revision});await store.put('platform_updates',{id:'private-update',fixtureId:'other-fixture',revision:999});});
 const first=await store.documentPage<{revision:number}>({repository:'platform_updates',filter:{fixtureId:'authorized-fixture'},limit:50,orderBy:'revision'});expect(first.total).toBe(110);expect(first.items[0].revision).toBe(110);expect(first.items.at(-1)?.revision).toBe(61);expect(first.nextCursor).toBe('61');
 const second=await store.documentPage<{revision:number}>({repository:'platform_updates',filter:{fixtureId:'authorized-fixture'},limit:50,orderBy:'revision',afterId:first.nextCursor!});expect(second.items[0].revision).toBe(60);expect(second.items.at(-1)?.revision).toBe(11);
});


it('serves legacy referee navigation with real read-only SQL and no global command lock', async () => {
  const {db,store}=await setup();
  const {createApplicationContainer}=await import('../src/config/application-container.js');
  const {createRestApiRouter}=await import('../src/api/router.js');
  const app=createApplicationContainer({store,seedDemo:false});
  const id='61000000-0000-4000-8000-000000000001';
  const refereeId='61000000-0000-4000-8000-000000000002';
  await store.transaction(()=>app.repositories.matches.upsert({id,refereeId,federationId:'61000000-0000-4000-8000-000000000003',homeClubId:'61000000-0000-4000-8000-000000000004',awayClubId:'61000000-0000-4000-8000-000000000005',season:'2026',scheduledAt:'2026-12-01T12:00:00Z',venue:'Test',status:'scheduled',createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-01T12:00:00Z',deletedAt:null}).then(()=>undefined));
  const query=vi.spyOn(db,'query'), router=createRestApiRouter(app);
  for(const path of ['/matches','/match-sheets','/recognitions/workflow','/recognitions','/match-reports']){
    const response=await router.handle({method:'GET',path:'/api/v1'+path,query:{matchId:id},headers:{},auth:{actorId:refereeId,roles:['referee'],refereeIds:[refereeId]}});
    expect(response.status,path).toBe(200);
  }
  expect(query.mock.calls.filter(([sql])=>sql==='BEGIN READ ONLY')).toHaveLength(5);
  expect(query.mock.calls.some(([sql])=>sql.includes('pg_advisory_xact_lock'))).toBe(false);
});
