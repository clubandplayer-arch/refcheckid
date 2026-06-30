import type { Referee } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class RefereesRepository extends NotImplementedRepository<Referee> {
  constructor() {
    super('RefereesRepository');
  }
}
