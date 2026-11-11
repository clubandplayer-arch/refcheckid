import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import type { RuntimePersistence } from '../repositories/runtime-persistence.js';
import { postgresTlsOptions } from './postgres-tls.js';
import { photoApprovalPageSql, type PhotoApprovalPageQuery, type PhotoApprovalPageResult } from '../repositories/photo-approval-page.js';

interface TransactionContext {
  client: PoolClient;
  lists: Map<string, Promise<readonly unknown[]>>;
  entities: Map<string, Promise<unknown>>;
  queue: Promise<void>;
  failed: boolean;
  failure: unknown;
  readOnly: boolean;
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

  private query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[]): Promise<QueryResult<T>> {
    const context = this.context.getStore();
    if (!context) return this.pool.query<T>(sql, values);
    // Repository calls may use Promise.all, but a pg client is one connection.
    // Never submit another statement until its previous query has settled.
    const run = context.queue.then(() => context.client.query<T>(sql, values));
    context.queue = run.then(() => undefined, (error: unknown) => {
      if (!context.failed) { context.failed = true; context.failure = error; }
    });
    return run;
  }

  async list<T>(name: string): Promise<readonly T[]> {
    const context = this.context.getStore();
    let pending = context?.lists.get(name);
    if (!pending) {
      pending = this.query<{ document: T }>(
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
      pending = this.query<{ document: T }>(
        'SELECT document FROM refcheckid.entities WHERE repository=$1 AND id=$2', [name, id])
        .then((result) => result.rows[0]?.document ?? null);
      context?.entities.set(key, pending);
    }
    return structuredClone(await pending) as T | null;
  }

  async put<T extends { id: string }>(name: string, row: T): Promise<void> {
    const context = this.context.getStore();
    if (!context) throw new Error('Cloud writes require a command transaction.');
    if (context.readOnly) throw new Error('Writes are forbidden in a read-only transaction.');
    await this.query(`INSERT INTO refcheckid.entities(repository,id,document) VALUES ($1,$2,$3::jsonb)
      ON CONFLICT(repository,id) DO UPDATE SET document=excluded.document`, [name, row.id, JSON.stringify(row)]);
    context.lists.delete(name);
    context.entities.delete(`${name}\0${row.id}`);
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.runTransaction(operation, false);
  }

  async readTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.runTransaction(operation, true);
  }

  async find<T>(name: string, filter: Record<string, unknown>): Promise<readonly T[]> {
    const result = await this.query<{ document: T }>(
      'SELECT document FROM refcheckid.entities WHERE repository=$1 AND document @> $2::jsonb ORDER BY ordinal', [name, JSON.stringify(filter)]);
    return result.rows.map((row) => row.document);
  }

  async photoApprovalPage(input: PhotoApprovalPageQuery): Promise<PhotoApprovalPageResult> {
    const result = await this.query<PhotoApprovalPageResult>(photoApprovalPageSql,
      [input.federationIds, input.status ?? null, input.clubId ?? null, input.sla ?? null, input.now,
        input.afterRequestedAt ?? null, input.afterId ?? null, input.limit]);
    return result.rows[0];
  }

  private async runTransaction<T>(operation: () => Promise<T>, readOnly: boolean): Promise<T> {
    if (this.context.getStore()) return operation();
    const client = await this.pool.connect();
    const context: TransactionContext = { client, lists: new Map(), entities: new Map(),
      queue: Promise.resolve(), failed: false, failure: undefined, readOnly };
    try {
      await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
      // All application instances use this lock. Preserve existing read/check/write
      // invariants (one active photo, immutable submitted sheets, refresh rotation).
      // A pilot starts serialized; per-match locks require a separate load-tested change.
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '20s'");
      if (!readOnly) await client.query('SELECT pg_advisory_xact_lock(724391, 1)');
      const result = await this.context.run(context, operation);
      await context.queue;
      if (context.failed) throw context.failure;
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await context.queue;
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async close(): Promise<void> { await this.pool.end(); }
}
