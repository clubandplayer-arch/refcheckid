import { afterEach, expect, it, vi } from 'vitest';
import { fetchStaff } from '../../src/lib/api-client';

afterEach(() => vi.unstubAllGlobals());

it('keeps retired staff history out of the operational lineup while retaining active staff', async () => {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/staff-registrations') ? [
      { id: 'reg-active', staffMemberId: 'active', clubId: '70000000-0000-4000-8000-000000000003', season: '2026', role: 'Allenatore', status: 'active' },
      { id: 'reg-ended', staffMemberId: 'retired', clubId: '70000000-0000-4000-8000-000000000003', season: '2026', role: 'Vice allenatore', status: 'ended' },
    ] : url.includes('/staff-members') ? [
      { id: 'active', firstName: 'Mister', lastName: '', status: 'active' },
      { id: 'retired', firstName: 'Assistente', lastName: 'Home', status: 'inactive' },
    ] : { status: 'missing' };
    return Promise.resolve(Response.json(body));
  }));
  const rows = await fetchStaff();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: 'active', fullName: 'Mister', registrationId: 'reg-active' });
});
