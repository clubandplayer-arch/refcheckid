import type { Photo, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export class PhotoRepository extends DrizzleRepository<Photo> {
  constructor(initialRows: readonly Photo[] = []) {
    super({ tableName: 'photos', initialRows });
  }

  listByMatch(matchId: UUID): Promise<readonly Photo[]> {
    return Promise.resolve(this.values().filter((photo) => photo.matchId === matchId));
  }
}

export class PhotosRepository extends PhotoRepository {}
