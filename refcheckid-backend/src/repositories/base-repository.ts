import type { ISODateTime, UUID } from '../domain/index.js';
import { randomUUID } from 'node:crypto';
import type { RuntimeStore } from './runtime-store.js';

export interface RepositoryEntity {
  id: UUID;
  createdAt: ISODateTime;
  updatedAt?: ISODateTime;
  deletedAt?: ISODateTime | null;
}

export interface RepositoryQuery<TFilter extends Record<string, unknown> = Record<string, never>> {
  filter?: TFilter;
  limit?: number;
  offset?: number;
}

export interface BaseRepository<TEntity, TCreate = Partial<TEntity>, TUpdate = Partial<TEntity>> {
  findById(id: UUID): Promise<TEntity | null>;
  list(query?: RepositoryQuery): Promise<readonly TEntity[]>;
  create(input: TCreate): Promise<TEntity>;
  update(id: UUID, input: TUpdate): Promise<TEntity>;
}

export interface DrizzleRepositoryContext<TEntity extends RepositoryEntity> {
  readonly tableName: string;
  readonly initialRows?: readonly TEntity[];
  readonly now?: () => ISODateTime;
  readonly idFactory?: () => UUID;
}

export class RepositoryEntityNotFoundError extends Error {
  constructor(repositoryName: string, entityId: UUID) {
    super(`${repositoryName} entity ${entityId} was not found.`);
    this.name = 'RepositoryEntityNotFoundError';
  }
}

export class DrizzleRepository<
  TEntity extends RepositoryEntity,
  TCreate = Partial<TEntity>,
  TUpdate = Partial<TEntity>,
> implements BaseRepository<TEntity, TCreate, TUpdate> {
  private readonly rows = new Map<UUID, TEntity>();
  protected store?: RuntimeStore;

  bindStore(store: RuntimeStore): void {
    store.initialize(this.context.tableName, this.values());
    this.store = store;
  }
  private readonly now: () => ISODateTime;
  private readonly idFactory: () => UUID;

  constructor(protected readonly context: DrizzleRepositoryContext<TEntity>) {
    this.now = context.now ?? (() => new Date().toISOString());
    this.idFactory = context.idFactory ?? createUuid;

    for (const row of context.initialRows ?? []) {
      this.rows.set(row.id, row);
    }
  }

  findById(id: UUID): Promise<TEntity | null> {
    return Promise.resolve(this.store ? this.store.get<TEntity>(this.context.tableName, id) : this.rows.get(id) ?? null);
  }

  list(query: RepositoryQuery = {}): Promise<readonly TEntity[]> {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? Number.POSITIVE_INFINITY;

    return Promise.resolve(this.values().slice(offset, offset + limit));
  }

  create(input: TCreate): Promise<TEntity> {
    const timestamp = this.now();
    const row = {
      id: this.idFactory(),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      ...(input as Record<string, unknown>),
    } as TEntity;

    this.save(row);

    return Promise.resolve(row);
  }

  update(id: UUID, input: TUpdate): Promise<TEntity> {
    const existing = this.store ? this.store.get<TEntity>(this.context.tableName, id) : this.rows.get(id);

    if (existing == null) {
      throw new RepositoryEntityNotFoundError(this.context.tableName, id);
    }

    const updated = {
      ...existing,
      ...(input as Record<string, unknown>),
      id: existing.id,
      createdAt: existing.createdAt,
      ...('updatedAt' in existing ? { updatedAt: this.now() } : {}),
    } as TEntity;

    this.save(updated);

    return Promise.resolve(updated);
  }

  upsert(entity: TEntity): Promise<TEntity> {
    const existing = this.store ? this.store.get<TEntity>(this.context.tableName, entity.id) : this.rows.get(entity.id);

    if (existing == null) {
      this.save(entity);
      return Promise.resolve(entity);
    }

    const updated = { ...existing, ...entity, id: existing.id };
    this.save(updated);

    return Promise.resolve(updated);
  }

  values(): readonly TEntity[] {
    return this.store ? this.store.list<TEntity>(this.context.tableName) : [...this.rows.values()];
  }

  private save(row: TEntity): void {
    if (this.store) this.store.put(this.context.tableName, row);
    else this.rows.set(row.id, row);
  }
}

export class NotImplementedRepository<
  TEntity extends RepositoryEntity,
  TCreate = Partial<TEntity>,
  TUpdate = Partial<TEntity>,
> extends DrizzleRepository<TEntity, TCreate, TUpdate> {
  protected constructor(repositoryName: string) {
    super({ tableName: repositoryName });
  }
}

function createUuid(): UUID {
  return randomUUID();
}
