import { stableId } from '../platform/store.js';
import type { ApiRequest, AuthContext } from '../api/http.js';
import { json } from '../api/http.js';
import { requestContext } from '../api/request-context.js';
import { supabaseRequest, SupabaseRequestError } from './supabase-http.js';

export interface CloudProfile {
  sessionVersion?:number;
  managedClubIds?:string[];
  requiresBoundSessions?:boolean;
  clubFederationIds?: Record<string,string>;
  appRoles?: ('manager'|'referee'|'federation')[];
  id: string; actorId: string; email: string; displayName: string;
  role: 'manager' | 'referee' | 'federation' | 'admin'; enabled: boolean;
  clubIds?: string[]; federationIds?: string[]; refereeIds?: string[]; authorizedMatchIds?: string[];
}

async function profileForToken(token: string,passwordLogin=false): Promise<CloudProfile | null> {
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
  if(profile.requiresBoundSessions){
    let sessionId:unknown;try{sessionId=(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()) as {session_id?:unknown}).session_id;}catch{return null;}
    if(typeof sessionId!=='string'||!sessionId)return null;
    const store=requestContext.getStore()?.store;const key=stableId('provider-session',profile.id,sessionId);
    if(passwordLogin)await store?.put('platform_auth_sessions',{id:key,version:profile.sessionVersion??0});
    else {const binding=await store?.get<{version:number}>('platform_auth_sessions',key);if(!binding||binding.version!==(profile.sessionVersion??0))return null;}
  }
  return profile;
}

function publicUser(profile: CloudProfile) {
  const { actorId: id, email, displayName, role, clubIds = [], federationIds = [], refereeIds = [], authorizedMatchIds = [] } = profile;
  return { id, email, displayName, role, clubFederationIds:profile.clubFederationIds??{}, availableRoles:[...new Set([role,...(profile.appRoles??[])])], clubIds, federationIds, refereeIds, authorizedMatchIds };
}

export async function authenticateSupabaseToken(header?: string): Promise<AuthContext | null> {
  if (!header?.startsWith('Bearer ')) return null;
  const profile = await profileForToken(header.slice(7));
  if (!profile) return null;
  const { id: actorId, role, ...scopes } = publicUser(profile);
  return { ...scopes, actorId, roles: [...new Set([role,...(profile.appRoles??[])])] };
}

export async function cloudSession(request: ApiRequest, grant: 'password' | 'refresh_token') {
  const body = request.body as Record<string, unknown> | null;
  const payload = grant === 'password'
    ? { email: typeof body?.email === 'string' ? body.email.trim() : '', password: typeof body?.password === 'string' ? body.password : '' }
    : { refresh_token: typeof body?.refreshToken === 'string' ? body.refreshToken : '' };
  if (grant === 'password' && typeof payload.email === 'string') {
    const alias=await requestContext.getStore()?.store?.get<{email:string}>('platform_login_aliases',stableId('login',payload.email.toLowerCase()));
    if(alias)payload.email=alias.email;
  }
  try {
    const tokens = await (await supabaseRequest(`/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })).json() as { access_token: string; refresh_token: string; expires_in: number };
    const profile = await profileForToken(tokens.access_token,grant==='password');
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
