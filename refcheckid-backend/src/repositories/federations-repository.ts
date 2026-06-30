import type { Federation } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class FederationsRepository extends NotImplementedRepository<Federation> {
  constructor() {
    super('FederationsRepository');
  }
}
