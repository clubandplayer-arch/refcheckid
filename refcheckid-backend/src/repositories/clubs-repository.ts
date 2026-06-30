import type { Club } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class ClubsRepository extends NotImplementedRepository<Club> {
  constructor() {
    super('ClubsRepository');
  }
}
