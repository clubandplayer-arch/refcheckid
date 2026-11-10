import type { ApiRequest, AuthContext } from '../api/http.js';
import { json } from '../api/http.js';
import { requestContext } from '../api/request-context.js';
import { supabaseRequest, SupabaseRequestError } from './supabase-http.js';

export interface CloudProfile {
  id: string; actorId: string; email: string; displayName: string;
  role: 'manager' | 'referee' | 'federation' | 'admin'; enabled: boolean;
  clubIds?: string[]; federationIds?: string[]; refereeIds?: string[]; authorizedMatchIds?: string[];
}

async function profileForToken(token: string): Promise<CloudProfile | null> {
  let identity: { id?: string };
  try {
    identity = await (await supabaseRequest('/auth/v1/user', {}, token)).json() as { id?: string };
  } catch (error) {
    if (error instanceof SupabaseRequestError && [400, 401, 403].includes(error.status)) return null;
    throw error;
  }
  if (!identity.id) return null;
  const profile = await requestContext.getStore()?.store?.get<CloudProfile>('auth_profiles', identity.id);
  // Authorization comes exclusively from the server-managed profile, never user_metadata.
  if (!profile?.enabled || !['manager', 'referee', 'federation', 'admin'].includes(profile.role)) return null;
  return profile;
}

function publicUser(profile: CloudProfile) {
  const { actorId: id, email, displayName, role, clubIds = [], federationIds = [], refereeIds = [], authorizedMatchIds = [] } = profile;
  return { id, email, displayName, role, clubIds, federationIds, refereeIds, authorizedMatchIds };
}

export async function authenticateSupabaseToken(header?: string): Promise<AuthContext | null> {
  if (!header?.startsWith('Bearer ')) return null;
  const profile = await profileForToken(header.slice(7));
  if (!profile) return null;
  const { id: actorId, role, ...scopes } = publicUser(profile);
  return { ...scopes, actorId, roles: [role] };
}

export async function cloudSession(request: ApiRequest, grant: 'password' | 'refresh_token') {
  const body = request.body as Record<string, unknown> | null;
  const payload = grant === 'password'
    ? { email: typeof body?.email === 'string' ? body.email.trim() : '', password: typeof body?.password === 'string' ? body.password : '' }
    : { refresh_token: typeof body?.refreshToken === 'string' ? body.refreshToken : '' };
  try {
    const tokens = await (await supabaseRequest(`/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })).json() as { access_token: string; refresh_token: string; expires_in: number };
    const profile = await profileForToken(tokens.access_token);
    if (!profile) return invalidCredentials();
    return json(200, { accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), user: publicUser(profile) });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.status === 429) return json(429, { error: 'RATE_LIMITED', message: 'Troppi tentativi. Riprova più tardi.' });
    if (error instanceof SupabaseRequestError && [400, 401, 403, 422].includes(error.status)) return invalidCredentials();
    throw error;
  }
}

export async function cloudMe(request: ApiRequest) {
  const token = request.headers.authorization?.replace(/^Bearer /, '');
  const profile = token ? await profileForToken(token) : null;
  return profile ? json(200, publicUser(profile)) : invalidCredentials();
}

export async function cloudLogout(request: ApiRequest) {
  const token = request.headers.authorization?.replace(/^Bearer /, '');
  if (token) {
    try { await supabaseRequest('/auth/v1/logout?scope=local', { method: 'POST' }, token); }
    catch (error) { if (!(error instanceof SupabaseRequestError && [401, 403].includes(error.status))) throw error; }
  }
  return json(204, null);
}

function invalidCredentials() { return json(401, { error: 'INVALID_CREDENTIALS', message: 'Credenziali non valide o account non abilitato.' }); }
