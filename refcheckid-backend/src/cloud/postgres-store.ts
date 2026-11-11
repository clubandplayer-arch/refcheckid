import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { RuntimePersistence } from '../repositories/runtime-persistence.js';
import { postgresTlsOptions } from './postgres-tls.js';

interface TransactionContext {
  client: PoolClient;
  lists: Map<string, Promise<readonly unknown[]>>;
  entities: Map<string, Promise<unknown>>;
}

/** Durable PostgreSQL store. No request state is kept in Vercel's filesystem. */
export class PostgresStore implements RuntimePersistence {
  private readonly context = new AsyncLocalStorage<TransactionContext>();
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

  private get client(): Pool | PoolClient { return this.context.getStore()?.client ?? this.pool; }

  async list<T>(name: string): Promise<readonly T[]> {
    const context = this.context.getStore();
    let pending = context?.lists.get(name);
    if (!pending) {
      pending = this.client.query<{ document: T }>(
        'SELECT document FROM refcheckid.entities WHERE repository=$1 ORDER BY ordinal', [name])
        .then((result) => result.rows.map((row) => row.document));
      context?.lists.set(name, pending);
    }
    // SQLite returns fresh JSON documents on each read. Preserve that behavior:
    // callers must not mutate the transaction cache through returned objects.
    return structuredClone(await pending) as readonly T[];
  }

  async get<T>(name: string, id: string): Promise<T | null> {
    const context = this.context.getStore();
    const list = context?.lists.get(name);
    if (list) {
      const row = (await list).find((value) => value !== null && typeof value === 'object' && 'id' in value && value.id === id);
      return structuredClone(row ?? null) as T | null;
    }
    const key = `${name}\0${id}`;
    let pending = context?.entities.get(key);
    if (!pending) {
      pending = this.client.query<{ document: T }>(
        'SELECT document FROM refcheckid.entities WHERE repository=$1 AND id=$2', [name, id])
        .then((result) => result.rows[0]?.document ?? null);
      context?.entities.set(key, pending);
    }
    return structuredClone(await pending) as T | null;
  }

  async put<T extends { id: string }>(name: string, row: T): Promise<void> {
    const context = this.context.getStore();
    if (!context) throw new Error('Cloud writes require a command transaction.');
    await this.client.query(`INSERT INTO refcheckid.entities(repository,id,document) VALUES ($1,$2,$3::jsonb)
      ON CONFLICT(repository,id) DO UPDATE SET document=excluded.document`, [name, row.id, JSON.stringify(row)]);
    context.lists.delete(name);
    context.entities.delete(`${name}\0${row.id}`);
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
      const result = await this.context.run({ client, lists: new Map(), entities: new Map() }, operation);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async close(): Promise<void> { await this.pool.end(); }
}
