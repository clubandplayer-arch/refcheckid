import type { MatchReport } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class ReportsRepository extends NotImplementedRepository<MatchReport> {
  constructor() {
    super('ReportsRepository');
  }
}
