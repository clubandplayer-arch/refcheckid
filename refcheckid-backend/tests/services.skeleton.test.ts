import { describe, expect, it } from 'vitest';
import type { MatchRepositoryPort } from '../src/repositories/index.js';
import { MatchService } from '../src/services/index.js';

const matchRepository: MatchRepositoryPort = {
  findById: () => Promise.resolve(null),
  listByFederation: () => Promise.resolve([]),
  listByClub: () => Promise.resolve([]),
  listByReferee: () => Promise.resolve([]),
  updateStatus: () => Promise.reject(new Error('not implemented')),
};

describe('service skeleton', () => {
  it('exposes service classes', () => {
    expect(new MatchService({ matchesRepository: matchRepository })).toBeInstanceOf(MatchService);
  });
});
