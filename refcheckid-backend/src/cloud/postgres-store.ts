import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import type { RuntimePersistence } from '../repositories/runtime-persistence.js';
import { postgresTlsOptions } from './postgres-tls.js';
import {
  photoApprovalPageSql,
  type PhotoApprovalPageQuery,
  type PhotoApprovalPageResult,
} from '../repositories/photo-approval-page.js';

interface TransactionContext {
  client: PoolClient;
  lists: Map<string, Promise<readonly unknown[]>>;
  entities: Map<string, Promise<unknown>>;
  queue: Promise<void>;
  failed: boolean;
  failure: unknown;
  readOnly: boolean;
  finds: Map<string, Promise<readonly unknown[]>>;
  bulkWrites?: Map<string, { repository: string; id: string; document: unknown }>;
}

/** Durable PostgreSQL store. No request state is kept in Vercel's filesystem. */
export class PostgresStore implements RuntimePersistence {
  private readonly context = new AsyncLocalStorage<TransactionContext>();
  private readonly pool: Pool;

  constructor(config: PoolConfig, pool?: Pool) {
    this.pool =
      pool ??
      new Pool({
        max: 2,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 10_000,
        ...postgresTlsOptions(config),
      });
    // Avoid unhandled idle connection errors; queries still reject normally.
    this.pool.on('error', () => console.error('[RefCheckID] PostgreSQL idle connection failed'));
  }

  initialize<T extends { id: string }>(_name: string, initial: readonly T[]): void {
    if (initial.length)
      throw new Error(
        'Cloud data must be imported explicitly; automatic demo seeding is disabled.',
      );
  }

  initialized(): boolean {
    return true;
  }

  private query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: unknown[],
  ): Promise<QueryResult<T>> {
    const context = this.context.getStore();
    if (!context) return this.pool.query<T>(sql, values);
    // Repository calls may use Promise.all, but a pg client is one connection.
    // Never submit another statement until its previous query has settled.
    const run = context.queue.then(() => context.client.query<T>(sql, values));
    context.queue = run.then(
      () => undefined,
      (error: unknown) => {
        if (!context.failed) {
          context.failed = true;
          context.failure = error;
        }
      },
    );
    return run;
  }

  async list<T>(name: string): Promise<readonly T[]> {
    const context = this.context.getStore();
    let pending = context?.lists.get(name);
    if (!pending) {
      pending = this.query<{ document: T }>(
        'SELECT document FROM refcheckid.entities WHERE repository=$1 ORDER BY ordinal',
        [name],
      ).then((result) => result.rows.map((row) => row.document));
      context?.lists.set(name, pending);
    }
    // SQLite returns fresh JSON documents on each read. Preserve that behavior:
    // callers must not mutate the transaction cache through returned objects.
    const rows = structuredClone(await pending) as T[];
    if (!context?.bulkWrites) return rows;
    const merged = new Map(rows.map((row) => [(row as { id: string }).id, row]));
    for (const entry of context.bulkWrites.values())
      if (entry.repository === name) merged.set(entry.id, structuredClone(entry.document) as T);
    return [...merged.values()];
  }

  async get<T>(name: string, id: string): Promise<T | null> {
    const context = this.context.getStore();
    const buffered = context?.bulkWrites?.get(`${name}\0${id}`);
    if (buffered) return structuredClone(buffered.document) as T;
    const list = context?.lists.get(name);
    if (list) {
      const row = (await list).find(
        (value) => value !== null && typeof value === 'object' && 'id' in value && value.id === id,
      );
      return structuredClone(row ?? null) as T | null;
    }
    const key = `${name}\0${id}`;
    let pending = context?.entities.get(key);
    if (!pending) {
      pending = this.query<{ document: T }>(
        'SELECT document FROM refcheckid.entities WHERE repository=$1 AND id=$2',
        [name, id],
      ).then((result) => result.rows[0]?.document ?? null);
      context?.entities.set(key, pending);
    }
    return structuredClone(await pending) as T | null;
  }

  async put<T extends { id: string }>(name: string, row: T): Promise<void> {
    const context = this.context.getStore();
    if (!context) throw new Error('Cloud writes require a command transaction.');
    if (context.readOnly) throw new Error('Writes are forbidden in a read-only transaction.');
    if (context.bulkWrites)
      context.bulkWrites.set(`${name}\0${row.id}`, {
        repository: name,
        id: row.id,
        document: structuredClone(row),
      });
    else
      await this.query(
        `INSERT INTO refcheckid.entities(repository,id,document) VALUES ($1,$2,$3::jsonb)
      ON CONFLICT(repository,id) DO UPDATE SET document=excluded.document`,
        [name, row.id, JSON.stringify(row)],
      );
    context.lists.delete(name);
    for (const key of context.finds.keys())
      if (key.startsWith(`${name}\0`)) context.finds.delete(key);
    context.entities.delete(`${name}\0${row.id}`);
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.runTransaction(operation, false);
  }

  async readTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.runTransaction(operation, true);
  }

  async find<T>(name: string, filter: Record<string, unknown>): Promise<readonly T[]> {
    const context = this.context.getStore();
    const cacheKey = `${name}\0${JSON.stringify(filter)}`;
    let pending = context?.finds.get(cacheKey);
    if (!pending) {
      pending = this.query<{ document: T }>(
        'SELECT document FROM refcheckid.entities WHERE repository=$1 AND document @> $2::jsonb ORDER BY ordinal',
        [name, JSON.stringify(filter)],
      ).then((result) => result.rows.map((row) => row.document));
      context?.finds.set(cacheKey, pending);
    }
    const rows = structuredClone(await pending) as T[];
    const buffered = context?.bulkWrites;
    if (!buffered) return rows;
    const merged = new Map(rows.map((row) => [(row as { id: string }).id, row]));
    for (const entry of buffered.values())
      if (entry.repository === name) {
        merged.delete(entry.id);
        if (
          Object.entries(filter).every(
            ([key, value]) =>
              JSON.stringify((entry.document as Record<string, unknown>)[key]) ===
              JSON.stringify(value),
          )
        )
          merged.set(entry.id, structuredClone(entry.document) as T);
      }
    return [...merged.values()];
  }

  async bulkTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.runTransaction(operation, false, true);
  }
  async prefetch(keys: readonly { repository: string; id: string }[]): Promise<void> {
    const context = this.context.getStore();
    if (!context || !keys.length) return;
    const missing = keys.filter(
      ({ repository, id }) =>
        !context.entities.has(`${repository}\0${id}`) &&
        !context.bulkWrites?.has(`${repository}\0${id}`),
    );
    if (!missing.length) return;
    const result = await this.query<{ repository: string; id: string; document: unknown }>(
      `SELECT e.repository,e.id,e.document FROM refcheckid.entities e JOIN jsonb_to_recordset($1::jsonb) AS wanted(repository text,id text) ON wanted.repository=e.repository AND wanted.id=e.id`,
      [JSON.stringify(missing)],
    );
    const rows = new Map(result.rows.map((row) => [`${row.repository}\0${row.id}`, row.document]));
    for (const { repository, id } of missing)
      context.entities.set(
        `${repository}\0${id}`,
        Promise.resolve(rows.get(`${repository}\0${id}`) ?? null),
      );
  }
  async findMany<T>(
    repository: string,
    key: string,
    values: readonly string[],
  ): Promise<readonly T[]> {
    if (!values.length) return [];
    const filters = [...new Set(values)].map((value) => ({ [key]: value }));
    const result = await this.query<{ id: string; document: T }>(
      `SELECT DISTINCT ON(e.id) e.id,e.document FROM refcheckid.entities e JOIN jsonb_array_elements($2::jsonb) AS wanted(value) ON e.document @> wanted.value WHERE e.repository=$1 ORDER BY e.id`,
      [repository, JSON.stringify(filters)],
    );
    const context = this.context.getStore();
    for (const row of result.rows)
      context?.entities.set(`${repository}\0${row.id}`, Promise.resolve(row.document));
    return result.rows.map((row) => row.document);
  }

  async documentPage<T>(input: {
    repository: string;
    filter: Record<string, unknown>;
    limit: number;
    afterId?: string;orderBy?:'revision';
    search?: string;
  }) {
    const ordering=input.orderBy==='revision'?"(document->>'revision')::int DESC":"id";
    const after=input.orderBy==='revision'?"(document->>'revision')::int < $3::int":"id>$3";
    const result = await this.query<{ total: number; items: T[] }>(
      `WITH scoped AS MATERIALIZED (
      SELECT id, document FROM refcheckid.entities WHERE repository=$1 AND document @> $2::jsonb AND ($5::text IS NULL OR document::text ILIKE $5)
    ), page AS (SELECT id,document FROM scoped WHERE ($3::text IS NULL OR ${after}) ORDER BY ${ordering} LIMIT $4)
    SELECT (SELECT count(*)::int FROM scoped) AS total, coalesce((SELECT jsonb_agg(document ORDER BY ${ordering}) FROM page),'[]'::jsonb) AS items`,
      [
        input.repository,
        JSON.stringify(input.filter),
        input.afterId ?? null,
        input.limit + 1,
        input.search ? `%${input.search.slice(0, 100)}%` : null,
      ],
    );
    const row = result.rows[0];
    const more = row.items.length > input.limit;
    return {
      total: row.total,
      items: row.items.slice(0, input.limit),
      nextCursor: more ? input.orderBy==='revision'?String((row.items[input.limit-1] as {revision:number}).revision):(row.items[input.limit - 1] as { id: string }).id : null,
    };
  }

  async photoApprovalPage(input: PhotoApprovalPageQuery): Promise<PhotoApprovalPageResult> {
    const result = await this.query<PhotoApprovalPageResult>(photoApprovalPageSql, [
      input.federationIds,
      input.status ?? null,
      input.clubId ?? null,
      input.sla ?? null,
      input.now,
      input.afterRequestedAt ?? null,
      input.afterId ?? null,
      input.limit,
      input.clubIds ?? [],
      input.federationFilter ?? null,
    ]);
    return result.rows[0];
  }

  private async runTransaction<T>(
    operation: () => Promise<T>,
    readOnly: boolean,
    buffered = false,
  ): Promise<T> {
    if (this.context.getStore()) return operation();
    const client = await this.pool.connect();
    const context: TransactionContext = {
      client,
      lists: new Map(),
      entities: new Map(),
      finds: new Map(),
      queue: Promise.resolve(),
      failed: false,
      failure: undefined,
      readOnly,
      ...(buffered ? { bulkWrites: new Map() } : {}),
    };
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
      if (context.bulkWrites?.size)
        await client.query(
          `INSERT INTO refcheckid.entities(repository,id,document) SELECT repository,id,document FROM jsonb_to_recordset($1::jsonb) AS batch(repository text,id text,document jsonb) ON CONFLICT(repository,id) DO UPDATE SET document=excluded.document`,
          [JSON.stringify([...context.bulkWrites.values()])],
        );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await context.queue;
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
