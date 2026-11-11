import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import { PostgresStore } from '../src/cloud/postgres-store.js';
import { photoApprovalPageSql } from '../src/repositories/photo-approval-page.js';

it('bounds a 4000-photo queue to 13 hydrated rows in one query, applies scope first, and uses stable cursors', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA refcheckid;
      CREATE TABLE refcheckid.entities(repository text,id text,document jsonb,ordinal bigint GENERATED ALWAYS AS IDENTITY,PRIMARY KEY(repository,id));
      INSERT INTO refcheckid.entities(repository,id,document)
      SELECT 'photo_approvals', '10000000-0000-4000-8000-'||lpad(i::text,12,'0'),jsonb_build_object(
        'id','10000000-0000-4000-8000-'||lpad(i::text,12,'0'), 'federationId','home-fed',
        'photoVersionId','version-'||i,'registrationId','registration-'||i,'status','pending',
        'requestedAt','2026-11-11T00:00:00.000Z','deletedAt',null,'slaDueAt',null)
      FROM generate_series(1,4000) i;
      INSERT INTO refcheckid.entities(repository,id,document) VALUES
      ('photo_approvals','foreign', '{"id":"foreign","federationId":"foreign-fed","status":"pending","requestedAt":"2026-11-10T00:00:00.000Z","deletedAt":null}');
      INSERT INTO refcheckid.entities(repository,id,document)
      SELECT 'player_registrations','registration-'||i,jsonb_build_object('id','registration-'||i,'clubId','club-'||(i%2),'playerId','player-'||i) FROM generate_series(1,4000) i;
      INSERT INTO refcheckid.entities(repository,id,document)
      SELECT 'players','player-'||i,jsonb_build_object('id','player-'||i,'firstName','Player','lastName',i::text) FROM generate_series(1,4000) i;
      INSERT INTO refcheckid.entities(repository,id,document) VALUES
      ('clubs','club-0','{"id":"club-0","name":"Home"}'),('clubs','club-1','{"id":"club-1","name":"Away"}');`);
    await db.exec(await readFile(new URL('../../supabase/migrations/202611110002_photo_queue_indexes.sql', import.meta.url), 'utf8'));
    const execute = vi.fn((sql: string, args?: unknown[]) => db.query(sql, args));
    const pool = { query: execute, on() {}, end() {} } as unknown as Pool;
    const store = new PostgresStore({}, pool);
    const query = { federationIds: ['home-fed'], status: 'pending', now: '2026-11-11T12:00:00.000Z', limit: 13 };
    const before = performance.now();
    const first = await store.photoApprovalPage(query);
    console.info('Local PostgreSQL engine 4000-photo page milliseconds:', Math.round(performance.now() - before));
    expect(first.total).toBe(4000); expect(first.items).toHaveLength(13);
    expect(first.items[0].subjectName).toBe('Player 1');
    expect(first.items.some((row) => row.federationId !== 'home-fed')).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toBe(photoApprovalPageSql);
    const lastVisible = first.items[11];
    await db.query(`UPDATE refcheckid.entities SET document=jsonb_set(document,'{status}','"approved"') WHERE repository='photo_approvals' AND id=$1`, [first.items[0].id]);
    const second = await store.photoApprovalPage({ ...query, afterId: lastVisible.id, afterRequestedAt: lastVisible.requestedAt });
    expect(second.items[0].id).toBe(first.items[12].id);
    expect(second.total).toBe(3999);
    const club = await store.photoApprovalPage({ ...query, clubId: 'club-0' });
    expect(club.total).toBe(2000);
    expect(club.items.every((row) => row.clubId === 'club-0')).toBe(true);
    const summary = await store.photoApprovalPage({ ...query, limit: 0 });
    expect(summary.total).toBe(3999); expect(summary.items).toEqual([]);
    expect((await store.photoApprovalPage({ ...query, federationIds: [] })).total).toBe(0);
  } finally { await db.close(); }
}, 20_000);
