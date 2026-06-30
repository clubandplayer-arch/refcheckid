import { describe, expect, it } from 'vitest';
import { MatchService } from '../src/services/index.js';

describe('service skeleton', () => {
  it('exposes service classes', () => {
    expect(new MatchService().describe()).toBe('MatchService skeleton');
  });
});
