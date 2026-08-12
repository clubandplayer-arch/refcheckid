import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { UUID } from '../domain/index.js';
import { DrizzleRepository, type RepositoryEntity } from './base-repository.js';

export function resolveRuntimeStateRoot(): string | null {
  if (process.env.REFCHECKID_RUNTIME_STATE_ROOT !== undefined) {
    return process.env.REFCHECKID_RUNTIME_STATE_ROOT;
  }
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return null;
  return join(process.cwd(), 'storage', 'refcheckid-runtime-state-dev');
}

export function loadRuntimeState<T>(path: string, fallback: readonly T[]): readonly T[] {
  if (!existsSync(path)) return fallback;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed))
    throw new Error(`Runtime state store ${path} must contain a JSON array.`);
  return parsed as readonly T[];
}

export function persistRuntimeState(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, path);
}

export class PersistentRuntimeRepository<
  TEntity extends RepositoryEntity,
  TCreate = Partial<TEntity>,
  TUpdate = Partial<TEntity>,
> extends DrizzleRepository<TEntity, TCreate, TUpdate> {
  private readonly persistencePath: string | null;

  constructor(
    tableName: string,
    fileName: string,
    initialRows: readonly TEntity[] = [],
    persistenceRoot: string | null = resolveRuntimeStateRoot(),
  ) {
    const persistencePath = persistenceRoot === null ? null : join(persistenceRoot, fileName);
    super({
      tableName,
      initialRows:
        persistencePath === null ? initialRows : loadRuntimeState(persistencePath, initialRows),
    });
    this.persistencePath = persistencePath;
  }

  override async create(input: TCreate): Promise<TEntity> {
    const entity = await super.create(input);
    this.persist();
    return entity;
  }

  override async update(id: UUID, input: TUpdate): Promise<TEntity> {
    const entity = await super.update(id, input);
    this.persist();
    return entity;
  }

  override async upsert(entity: TEntity): Promise<TEntity> {
    const result = await super.upsert(entity);
    this.persist();
    return result;
  }

  private persist(): void {
    if (this.persistencePath !== null) persistRuntimeState(this.persistencePath, this.values());
  }
}
