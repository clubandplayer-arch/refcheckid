import { expect, it } from 'vitest';
import { selectOperationalMatch, type ApiMatch } from '../../src/lib/api-client';

it('selects the next active match before old completed matches, excluding cancelled fixtures', () => {
  const match = (id: string, status: string, scheduledAt: string): ApiMatch => ({ id, status, scheduledAt, homeClubId: 'home', awayClubId: 'away', refereeId: null, venue: null });
  const old = match('old', 'completed', '2026-01-01');
  const current = match('current', 'scheduled', '2026-11-10');
  const future = match('future', 'scheduled', '2026-12-01');
  expect(selectOperationalMatch([old, future, current])).toBe(current);
  expect(selectOperationalMatch([old, match('cancelled', 'cancelled', '2026-01-01')])).toBe(old);
  expect(selectOperationalMatch([match('cancelled', 'cancelled', '2026-01-01')])).toBeNull();
});
