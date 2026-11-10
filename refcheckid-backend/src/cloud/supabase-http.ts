/** Server-only REST client. Never return upstream response bodies or credentials. */
export class SupabaseRequestError extends Error {
  constructor(readonly status: number) {
    super('Supabase request failed.'); this.name = 'SupabaseRequestError';
  }
}

export async function supabaseRequest(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const origin = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVER_KEY;
  if (!origin || !key) throw new Error('Supabase server configuration is missing.');
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  // Supports legacy service_role JWTs and current sb_secret keys.
  if (token) headers.set('authorization', `Bearer ${token}`);
  else if (!key.startsWith('sb_secret_')) headers.set('authorization', `Bearer ${key}`);
  const response = await fetch(`${origin.replace(/\/$/, '')}${path}`, {
    ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(20_000), redirect: 'error',
  });
  if (!response.ok) throw new SupabaseRequestError(response.status);
  return response;
}
