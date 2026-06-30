import { describe, expect, it } from 'vitest';
import { FederationsRepository } from '../src/repositories/index.js';

describe('repository skeleton', () => {
  it('exposes repository classes', () => {
    expect(new FederationsRepository()).toBeInstanceOf(FederationsRepository);
  });
});
