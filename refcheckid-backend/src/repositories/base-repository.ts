import type { UUID } from '../domain/index.js';

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

export abstract class NotImplementedRepository<TEntity, TCreate = Partial<TEntity>, TUpdate = Partial<TEntity>>
  implements BaseRepository<TEntity, TCreate, TUpdate>
{
  protected constructor(protected readonly repositoryName: string) {}

  findById(_id: UUID): Promise<TEntity | null> {
    return Promise.reject(new Error(`${this.repositoryName}.findById is not implemented yet.`));
  }

  list(_query?: RepositoryQuery): Promise<readonly TEntity[]> {
    return Promise.reject(new Error(`${this.repositoryName}.list is not implemented yet.`));
  }

  create(_input: TCreate): Promise<TEntity> {
    return Promise.reject(new Error(`${this.repositoryName}.create is not implemented yet.`));
  }

  update(_id: UUID, _input: TUpdate): Promise<TEntity> {
    return Promise.reject(new Error(`${this.repositoryName}.update is not implemented yet.`));
  }
}
