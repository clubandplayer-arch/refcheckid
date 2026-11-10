import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { createRestApiRouter } from '../../src/api/router.js';
import { createRuntimeServer } from '../../src/server.js';

afterEach(() => vi.unstubAllEnvs());

it('refuses production startup without required identity and origin configuration', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('AUTH_SECRET', 'short');
  vi.stubEnv('AUTH_USERS_FILE', '');
  expect(() => createRuntimeServer()).toThrow('Production requires');
});

it('uses hashed configured users, disables demo identities, rotates refresh sessions and revokes logout', async () => {
  const root = mkdtempSync(join(tmpdir(), 'refcheckid-identities-'));
  const file = join(root, 'users.json');
  const salt = randomBytes(32).toString('hex');
  const password = 'Test-only password 2026';
  writeFileSync(file, JSON.stringify([{ id: '90000000-0000-4000-8000-000000000123', email: 'operator@example.test', role: 'manager', displayName: 'Operator', enabled: true, clubIds: ['70000000-0000-4000-8000-000000000003'], passwordHash: `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}` }]), { mode: 0o600 });
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('AUTH_SECRET', randomBytes(32).toString('hex'));
  vi.stubEnv('AUTH_USERS_FILE', file);
  vi.stubEnv('REFCHECKID_PHOTO_METADATA_ROOT', join(root, 'metadata'));
  const app = createApplicationContainer({ databasePath: ':memory:', seedDemo: false });
  const router = createRestApiRouter(app);
  const post = (path: string, body: unknown, token = '') => router.handle({ method: 'POST', path: `/api/v1/auth/${path}`, headers: { authorization: `Bearer ${token}` }, query: {}, body });
  try {
    expect((await post('login', { email: 'dirigente@refcheckid.local', password: 'Password123!' })).status).toBe(401);
    expect((await post('login', { email: 'operator@example.test', password: 'wrong' })).status).toBe(401);
    const response = await post('login', { email: 'operator@example.test', password });
    expect(response.status).toBe(200);
    const session = response.body as { accessToken: string; refreshToken: string; user: Record<string, unknown> };
    expect(session.user.passwordHash).toBeUndefined();
    const refreshed = await post('refresh', { refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(200);
    expect((await post('refresh', { refreshToken: session.refreshToken })).status).toBe(401);
    const next = refreshed.body as { accessToken: string; refreshToken: string };
    expect((await post('logout', {}, next.accessToken)).status).toBe(204);
    expect((await post('refresh', { refreshToken: next.refreshToken })).status).toBe(401);
    expect((await app.repositories.matches.list()).length).toBe(0);
  } finally { app.store.close(); rmSync(root, { recursive: true, force: true }); }
});
