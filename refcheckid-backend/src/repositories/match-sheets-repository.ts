import type { MatchSheet, MatchSheetPlayer, MatchSheetStaff } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class MatchSheetsRepository extends NotImplementedRepository<MatchSheet> {
  constructor() {
    super('MatchSheetsRepository');
  }
}
