import { describe, expect, it } from 'vitest';

const performanceProfiles = {
  load: { virtualUsers: 50, duration: '5m', target: 'baseline throughput' },
  stress: { virtualUsers: 250, duration: '10m', target: 'saturation point' },
  spike: { virtualUsers: 500, duration: '1m', target: 'burst resilience' },
} as const;

describe('performance test structure', () => {
  it('defines load, stress, and spike profiles without executing them in CI', () => {
    expect(Object.keys(performanceProfiles)).toEqual(['load', 'stress', 'spike']);
    expect(performanceProfiles.spike.virtualUsers).toBeGreaterThan(performanceProfiles.load.virtualUsers);
  });
});
