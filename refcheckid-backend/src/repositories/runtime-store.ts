import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync as Database } from 'node:sqlite';
// Vite 5 predates this Node built-in; resolve it with Node rather than its module loader.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/** Durable single-instance store. One transaction covers each application command. */
export class RuntimeStore {
  private readonly db: Database;
  private readonly context = new AsyncLocalStorage<boolean>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS repository_names (name TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS entities (
        repository TEXT NOT NULL, id TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)),
        PRIMARY KEY(repository, id));`);
  }

  initialize<T extends { id: string }>(name: string, initial: readonly T[]): void {
    if (this.initialized(name)) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of initial) this.put(name, row);
      this.db.prepare('INSERT INTO repository_names(name) VALUES (?)').run(name);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  initialized(name: string): boolean {
    return !!this.db.prepare('SELECT name FROM repository_names WHERE name=?').get(name);
  }

  list<T>(name: string): readonly T[] {
    return this.db.prepare('SELECT document FROM entities WHERE repository=? ORDER BY rowid')
      .all(name).map((row) => JSON.parse(row.document as string) as T);
  }

  get<T>(name: string, id: string): T | null {
    const row = this.db.prepare('SELECT document FROM entities WHERE repository=? AND id=?').get(name, id);
    return row ? JSON.parse(row.document as string) as T : null;
  }

  put<T extends { id: string }>(name: string, row: T): void {
    this.db.prepare(`INSERT INTO entities(repository,id,document) VALUES (?,?,?)
      ON CONFLICT(repository,id) DO UPDATE SET document=excluded.document`)
      .run(name, row.id, JSON.stringify(row));
  }

  /** Serialize reads as well as writes, so no request sees another command's partial state. */
  transaction<T>(operation: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return operation();
    const run = this.queue.then(() => this.context.run(true, async () => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = await operation();
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }));
    this.queue = run.catch(() => undefined);
    return run;
  }

  close(): void { this.db.close(); }
}
