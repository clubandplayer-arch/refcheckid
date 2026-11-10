/** Local development and PostgreSQL share the same command transaction boundary. */
export interface RuntimePersistence {
  initialize<T extends { id: string }>(name: string, initial: readonly T[]): void;
  initialized(name: string): boolean;
  list<T>(name: string): readonly T[] | Promise<readonly T[]>;
  get<T>(name: string, id: string): T | null | Promise<T | null>;
  put<T extends { id: string }>(name: string, row: T): void | Promise<void>;
  transaction<T>(operation: () => Promise<T>): Promise<T>;
  close(): void | Promise<void>;
}
