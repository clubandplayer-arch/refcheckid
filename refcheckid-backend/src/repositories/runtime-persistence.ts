import type { PhotoApprovalPageQuery, PhotoApprovalPageResult } from './photo-approval-page.js';
/** Local development and PostgreSQL share the same command transaction boundary. */
export interface RuntimePersistence {
  initialize<T extends { id: string }>(name: string, initial: readonly T[]): void;
  initialized(name: string): boolean;
  list<T>(name: string): readonly T[] | Promise<readonly T[]>;
  get<T>(name: string, id: string): T | null | Promise<T | null>;
  find?<T>(name: string, filter: Record<string, unknown>): Promise<readonly T[]>;
  documentPage?<T>(query: {
    repository: string;
    filter: Record<string, unknown>;
    limit: number;
    afterId?: string;orderBy?:'revision';
    search?: string;
  }): Promise<{ total: number; items: T[]; nextCursor: string | null }>;
  photoApprovalPage?(query: PhotoApprovalPageQuery): Promise<PhotoApprovalPageResult>;
  put<T extends { id: string }>(name: string, row: T): void | Promise<void>;
  bulkTransaction?<T>(operation: () => Promise<T>): Promise<T>;
  prefetch?(keys: readonly { repository: string; id: string }[]): Promise<void>;
  findMany?<T>(repository: string, key: string, values: readonly string[]): Promise<readonly T[]>;
  transaction<T>(operation: () => Promise<T>): Promise<T>;
  readTransaction?<T>(operation: () => Promise<T>): Promise<T>;
  resultArchiveReady?(): Promise<boolean>;
  close(): void | Promise<void>;
}
