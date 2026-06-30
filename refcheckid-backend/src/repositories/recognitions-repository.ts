import type { Recognition } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class RecognitionsRepository extends NotImplementedRepository<Recognition> {
  constructor() {
    super('RecognitionsRepository');
  }
}
