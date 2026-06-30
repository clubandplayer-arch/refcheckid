import type { Match } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class MatchesRepository extends NotImplementedRepository<Match> {
  constructor() {
    super('MatchesRepository');
  }
}
