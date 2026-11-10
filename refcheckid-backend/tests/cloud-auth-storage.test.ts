import { afterEach, expect, it, vi } from 'vitest';
import { authenticateSupabaseToken, cloudSession } from '../src/cloud/supabase-auth.js';
import { SupabasePhotoObjectStore } from '../src/cloud/supabase-photo-store.js';
import { requestContext } from '../src/api/request-context.js';
import { RuntimeStore } from '../src/repositories/runtime-store.js';
import { validateCloudConfiguration } from '../src/cloud/config.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function env() {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVER_KEY', 'sb_secret_test');
}

it('uses server-managed scopes, rejects disabled/unprovisioned users and ignores JWT user_metadata', async () => {
  env(); const store = new RuntimeStore(':memory:');
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'supabase-id', user_metadata: { role: 'admin' } })));
  vi.stubGlobal('fetch', fetcher);
  try {
    await requestContext.run({ store }, async () => {
      expect(await authenticateSupabaseToken('Bearer user-token')).toBeNull();
      store.put('auth_profiles', { id: 'supabase-id', actorId: 'legacy-actor', email: 'a@example.com', displayName: 'Manager', role: 'manager', enabled: true, clubIds: ['home'] });
      // Fresh Response instances are needed on repeated fetches.
      fetcher.mockImplementation(() => Promise.resolve(Response.json({ id: 'supabase-id', user_metadata: { role: 'admin' } })));
      const auth = await authenticateSupabaseToken('Bearer user-token');
      expect(auth).toMatchObject({ actorId: 'legacy-actor', roles: ['manager'], clubIds: ['home'] });
      store.put('auth_profiles', { id: 'supabase-id', enabled: false });
      expect(await authenticateSupabaseToken('Bearer user-token')).toBeNull();
    });
  } finally { store.close(); }
});

it('returns the existing Web session shape and handles Supabase rate limits without leaking upstream errors', async () => {
  env(); const store = new RuntimeStore(':memory:');
  store.put('auth_profiles', { id: 'identity', actorId: 'actor', email: 'a@example.com', displayName: 'A', role: 'referee', enabled: true });
  const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(url.includes('/token?')
    ? Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }) : Response.json({ id: 'identity' })));
  vi.stubGlobal('fetch', fetcher);
  const request = { method: 'POST' as const, path: '/api/v1/auth/login', params: {}, query: {}, headers: {}, body: { email: 'a@example.com', password: 'secret' } };
  try {
    const result = await requestContext.run({ store }, () => cloudSession(request, 'password'));
    expect(result.body).toMatchObject({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'actor', role: 'referee' } });
    fetcher.mockResolvedValue(new Response('sensitive upstream body', { status: 429 }));
    const rejected = await cloudSession(request, 'password');
    expect(rejected.status).toBe(429);
    expect(JSON.stringify(rejected)).not.toContain('sensitive');
  } finally { store.close(); }
});

it('uploads directly to a private signed URL and rejects unsafe object paths', async () => {
  env(); const fetcher = vi.fn().mockResolvedValue(Response.json({ url: '/object/upload/sign/refcheckid-photos/subjects/id/original.png?token=signed' }));
  vi.stubGlobal('fetch', fetcher);
  const photos = new SupabasePhotoObjectStore();
  const intent = await photos.createUploadIntent({ objectKey: 'subjects/id/original.png', mimeType: 'image/png', sha256: '0'.repeat(64), fileSizeBytes: 5 });
  expect(intent.uploadUrl).toBe('https://example.supabase.co/storage/v1/object/upload/sign/refcheckid-photos/subjects/id/original.png?token=signed');
  expect(intent.method).toBe('PUT');
  expect(intent.uploadUrl).not.toContain('sb_secret');
  await expect(photos.readObject('../secret')).rejects.toThrow('Invalid photo');
  await expect(photos.readObject('a\\b')).rejects.toThrow('Invalid photo');
});

it('fails closed on incomplete cloud configuration and unmarked preview data environments', () => {
  env(); vi.stubEnv('DATABASE_URL', 'postgresql://postgres:password@db.example.supabase.co/postgres?sslmode=verify-full'); vi.stubEnv('AUTH_SECRET', 's'.repeat(32));
  vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('REFCHECKID_DATA_ENV', 'production');
  expect(validateCloudConfiguration).toThrow('staging');
  vi.stubEnv('REFCHECKID_DATA_ENV', 'staging');
  expect(validateCloudConfiguration).not.toThrow();
  vi.stubEnv('REFCHECKID_DEMO_AUTO_BOOTSTRAP', 'true');
  expect(validateCloudConfiguration).toThrow('bootstrap');
});
