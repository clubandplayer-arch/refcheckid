import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import { PostgresStore } from '../src/cloud/postgres-store.js';
import { createApplicationContainer } from '../src/config/application-container.js';

it('approves one of 4000 proposals without downloading whole repositories, preserving history and scope checks', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA refcheckid;
      CREATE TABLE refcheckid.entities(repository text,id text,document jsonb,ordinal bigint GENERATED ALWAYS AS IDENTITY,PRIMARY KEY(repository,id));
      INSERT INTO refcheckid.entities(repository,id,document)
      SELECT 'photo_approvals','approval-'||i,jsonb_build_object('id','approval-'||i,'federationId','fed',
        'photoVersionId','new-'||i,'registrationId','reg-'||i,'seasonId','2026','status','pending',
        'requestedAt','2026-11-11T00:00:00.000Z','createdAt','2026-11-11T00:00:00.000Z','updatedAt','2026-11-11T00:00:00.000Z','deletedAt',null)
        FROM generate_series(1,4000) i;
      INSERT INTO refcheckid.entities(repository,id,document)
      SELECT 'photo_versions',prefix||i,jsonb_build_object('id',prefix||i,'globalOfficialPhotoId','global-'||i,
        'status',CASE WHEN prefix='new-' THEN 'pending_approval' ELSE 'active' END,
        'createdAt','2026-11-11T00:00:00.000Z','updatedAt','2026-11-11T00:00:00.000Z','deletedAt',null)
        FROM generate_series(1,4000) i CROSS JOIN (VALUES ('new-'),('old-')) p(prefix);
      INSERT INTO refcheckid.entities(repository,id,document)
      SELECT 'global_official_photos','global-'||i,jsonb_build_object('id','global-'||i,'photoSubjectId','subject-'||i,
        'currentVersionId','old-'||i,'status','active','createdAt','2026-11-11T00:00:00.000Z','updatedAt','2026-11-11T00:00:00.000Z','deletedAt',null)
        FROM generate_series(1,4000) i;
      INSERT INTO refcheckid.entities(repository,id,document)
      SELECT 'season_registration_photos','season-'||i,jsonb_build_object('id','season-'||i,'registrationId','reg-'||i,
        'seasonId','2026','effectiveVersionId','old-'||i,'createdAt','2026-11-11T00:00:00.000Z','updatedAt','2026-11-11T00:00:00.000Z','deletedAt',null)
        FROM generate_series(1,4000) i;`);
    let rowsRead = 0;
    const execute = vi.fn(async (sql: string, args?: unknown[]) => {
      const result = await db.query(sql, args); rowsRead += result.rows.length; return result;
    });
    const client = { query: execute, release() {} };
    const pool = { ...client, connect: () => Promise.resolve(client), on() {}, end() {} } as unknown as Pool;
    const store = new PostgresStore({}, pool);
    const app = createApplicationContainer({ store, seedDemo: false });
    const before = performance.now();
    const result = await app.services.photos.approvePhotoApproval({ approvalId: 'approval-1',
      context: { actorId: 'operator', actorRole: 'federation', federationId: 'fed' } });
    console.info('Local PostgreSQL engine decision milliseconds:', Math.round(performance.now() - before), 'queries:', execute.mock.calls.length, 'rows read:', rowsRead);
    expect(result.status).toBe('approved');
    expect(execute.mock.calls.length).toBeLessThan(35);
    expect(rowsRead).toBeLessThan(20);
    expect(execute.mock.calls.filter(([sql]) => sql.startsWith('SELECT document')).every(([sql]) => sql.includes('id=$2') || sql.includes('document @>'))).toBe(true);
    expect(await store.get('photo_versions', 'old-1')).toMatchObject({ status: 'superseded' });
    expect(await store.get('global_official_photos', 'global-1')).toMatchObject({ currentVersionId: 'new-1' });
    expect(await store.get('season_registration_photos', 'season-1')).toMatchObject({ effectiveVersionId: 'new-1' });
    expect(await store.get('photo_approvals', 'approval-2')).toMatchObject({ status: 'pending' });
    await expect(app.services.photos.approvePhotoApproval({ approvalId: 'approval-2',
      context: { actorId: 'foreign', actorRole: 'federation', federationId: 'foreign' } })).rejects.toThrow();
    expect(await store.get('photo_approvals', 'approval-2')).toMatchObject({ status: 'pending' });
    expect((await store.list<{ eventType: string }>('photo_audit_events')).filter((row) => row.eventType === 'photo.approved')).toHaveLength(1);
  } finally { await db.close(); }
}, 20_000);
