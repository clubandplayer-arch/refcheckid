import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { RuntimePersistence } from '../repositories/runtime-persistence.js';
import { postgresTlsOptions } from './postgres-tls.js';

/** Durable PostgreSQL store. No request state is kept in Vercel's filesystem. */
export class PostgresStore implements RuntimePersistence {
  private readonly context = new AsyncLocalStorage<PoolClient>();
  private readonly pool: Pool;

  constructor(config: PoolConfig, pool?: Pool) {
    this.pool = pool ?? new Pool({ max: 2, idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000, ...postgresTlsOptions(config) });
    // Avoid unhandled idle connection errors; queries still reject normally.
    this.pool.on('error', () => console.error('[RefCheckID] PostgreSQL idle connection failed'));
  }

  initialize<T extends { id: string }>(_name: string, initial: readonly T[]): void {
    if (initial.length) throw new Error('Cloud data must be imported explicitly; automatic demo seeding is disabled.');
  }

  initialized(): boolean { return true; }

  private get client(): Pool | PoolClient { return this.context.getStore() ?? this.pool; }

  async list<T>(name: string): Promise<readonly T[]> {
    const result = await this.client.query<{ document: T }>(
      'SELECT document FROM refcheckid.entities WHERE repository=$1 ORDER BY ordinal', [name]);
    return result.rows.map((row) => row.document);
  }

  async get<T>(name: string, id: string): Promise<T | null> {
    const result = await this.client.query<{ document: T }>(
      'SELECT document FROM refcheckid.entities WHERE repository=$1 AND id=$2', [name, id]);
    return result.rows[0]?.document ?? null;
  }

  async put<T extends { id: string }>(name: string, row: T): Promise<void> {
    if (!this.context.getStore()) throw new Error('Cloud writes require a command transaction.');
    await this.client.query(`INSERT INTO refcheckid.entities(repository,id,document) VALUES ($1,$2,$3::jsonb)
      ON CONFLICT(repository,id) DO UPDATE SET document=excluded.document`, [name, row.id, JSON.stringify(row)]);
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return operation();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // All application instances use this lock. Preserve existing read/check/write
      // invariants (one active photo, immutable submitted sheets, refresh rotation).
      // A pilot starts serialized; per-match locks require a separate load-tested change.
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '20s'");
      await client.query('SELECT pg_advisory_xact_lock(724391, 1)');
      const result = await this.context.run(client, operation);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async close(): Promise<void> { await this.pool.end(); }
}
