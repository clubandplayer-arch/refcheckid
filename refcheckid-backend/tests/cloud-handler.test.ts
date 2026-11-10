import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('../src/config/application-container.js', () => ({ createApplicationContainer: vi.fn() }));
vi.mock('../src/api/router.js', () => ({ createRestApiRouter: () => ({ handle: mocks.handle }) }));
import { handleCloudRequest } from '../src/cloud/vercel-handler.js';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('fails closed when cloud runtime is missing and never falls back to local SQLite', async () => {
  vi.stubEnv('REFCHECKID_RUNTIME', '');
  const response = await handleCloudRequest(new Request('https://app.example/api/health'));
  expect(response.status).toBe(503); expect(mocks.handle).not.toHaveBeenCalled();
});

it('passes API context through and rejects oversized or base64 requests before the command', async () => {
  vi.stubEnv('REFCHECKID_RUNTIME', 'supabase');
  mocks.handle.mockResolvedValue({ status: 200, body: { status: 'ok' } });
  const response = await handleCloudRequest(new Request('https://app.example/api/health?x=1'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.handle.mock.calls[0][0]).toMatchObject({ path: '/api/health', query: { x: '1' } });
  mocks.handle.mockClear();
  const tooLarge = await handleCloudRequest(new Request('https://app.example/api/v1/test', {
    method: 'POST', body: '{}', headers: { 'content-length': '2000000' },
  }));
  expect(tooLarge.status).toBe(413);
  const base64 = await handleCloudRequest(new Request('https://app.example/api/v1/test', {
    method: 'POST', body: JSON.stringify({ contentBase64: 'do-not-proxy' }),
  }));
  expect(base64.status).toBe(400); expect(mocks.handle).not.toHaveBeenCalled();
});

it('does not expose internal database errors or credentials', async () => {
  vi.stubEnv('REFCHECKID_RUNTIME', 'supabase');
  mocks.handle.mockRejectedValue(new Error('postgresql://sensitive-credentials'));
  const response = await handleCloudRequest(new Request('https://app.example/api/health'));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('sensitive');
});
