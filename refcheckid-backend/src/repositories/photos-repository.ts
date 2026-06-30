import type { Photo } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class PhotosRepository extends NotImplementedRepository<Photo> {
  constructor() {
    super('PhotosRepository');
  }
}
