import type { Player } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class PlayersRepository extends NotImplementedRepository<Player> {
  constructor() {
    super('PlayersRepository');
  }
}
