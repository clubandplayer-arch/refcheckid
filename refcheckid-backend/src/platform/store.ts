import { createHash, randomUUID } from 'node:crypto';
import type { RuntimePersistence } from '../repositories/runtime-persistence.js';
import type { Entity } from './types.js';
export const stableId = (...keys: string[]) => {
  const h = createHash('sha256').update(JSON.stringify(keys)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export class PlatformStore {
  constructor(readonly runtime: RuntimePersistence) {}
  async get<T extends Entity>(table: string, id: string) {
    return this.runtime.get<T>(`platform_${table}`, id);
  }
  async find<T extends Entity>(
    table: string,
    filter: Record<string, unknown>,
  ): Promise<readonly T[]> {
    if (this.runtime.find) return this.runtime.find<T>(`platform_${table}`, filter);
    return (await this.runtime.list<T>(`platform_${table}`)).filter((row) =>
      Object.entries(filter).every(
        ([key, value]) => (row as unknown as Record<string, unknown>)[key] === value,
      ),
    );
  }
  async put<T extends Entity>(
    table: string,
    input: Omit<T, keyof Entity> & Partial<Entity>,
  ): Promise<T> {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      createdAt: now,
      deletedAt: null,
      ...input,
      updatedAt: now,
    } as T;
    await this.runtime.put(`platform_${table}`, row);
    return row;
  }
  async update<T extends Entity>(table: string, id: string, patch: Partial<T>): Promise<T> {
    const previous = await this.get<T>(table, id);
    if (!previous) throw new Error('Record non trovato.');
    return this.put<T>(table, { ...previous, ...patch, id, createdAt: previous.createdAt });
  }
  async page<T extends Entity>(
    table: string,
    filter: Record<string, unknown>,
    cursor?: string,
    search?: string,
  ) {
    const query = {
      repository: `platform_${table}`,
      filter,
      limit: 50,
      ...(search ? { search: search.slice(0, 100) } : {}),
      ...(cursor ? { afterId: cursor } : {}),
    };
    if (this.runtime.documentPage) return this.runtime.documentPage<T>(query);
    const all = [...(await this.find<T>(table, filter))]
      .filter((row) => !search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.id.localeCompare(b.id));
    const rows = all.filter((row) => !cursor || row.id > cursor).slice(0, 51);
    return {
      total: all.length,
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  }
}
