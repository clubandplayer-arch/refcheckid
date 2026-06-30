import type { ISODateTime, UUID } from '../domain/index.js';

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
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  list(query: RepositoryQuery = {}): Promise<readonly TEntity[]> {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? Number.POSITIVE_INFINITY;

    return Promise.resolve([...this.rows.values()].slice(offset, offset + limit));
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

    this.rows.set(row.id, row);

    return Promise.resolve(row);
  }

  update(id: UUID, input: TUpdate): Promise<TEntity> {
    const existing = this.rows.get(id);

    if (existing === undefined) {
      throw new RepositoryEntityNotFoundError(this.context.tableName, id);
    }

    const updated = {
      ...existing,
      ...(input as Record<string, unknown>),
      id: existing.id,
      createdAt: existing.createdAt,
      ...('updatedAt' in existing ? { updatedAt: this.now() } : {}),
    } as TEntity;

    this.rows.set(id, updated);

    return Promise.resolve(updated);
  }

  upsert(entity: TEntity): Promise<TEntity> {
    const existing = this.rows.get(entity.id);

    if (existing === undefined) {
      this.rows.set(entity.id, entity);
      return Promise.resolve(entity);
    }

    const updated = { ...existing, ...entity, id: existing.id };
    this.rows.set(entity.id, updated);

    return Promise.resolve(updated);
  }

  values(): readonly TEntity[] {
    return [...this.rows.values()];
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
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
