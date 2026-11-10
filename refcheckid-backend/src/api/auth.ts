import { cloudEnabled } from '../cloud/config.js';
import { authenticateSupabaseToken, cloudSession, cloudMe, cloudLogout } from '../cloud/supabase-auth.js';
import { readFileSync } from 'node:fs';
import { requestContext } from './request-context.js';
import { createHmac, randomUUID, timingSafeEqual, scryptSync } from 'node:crypto';
import { pilotIds } from '../config/pilot-data.js';
import type { ApiHandler, AuthContext } from './http.js';
import { json } from './http.js';

type UserRole = 'manager' | 'referee' | 'federation' | 'admin';
type AuthErrorCode = 'INVALID_CREDENTIALS' | 'USER_NOT_FOUND' | 'ACCOUNT_DISABLED';

interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly password?: string;
  readonly passwordHash?: string;
  readonly role: UserRole;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly clubIds?: readonly string[];
  readonly federationIds?: readonly string[];
  readonly refereeIds?: readonly string[];
  readonly authorizedMatchIds?: readonly string[];
}

interface TokenPayload {
  readonly sid?: string;
  readonly sub: string;
  readonly email: string;
  readonly role: UserRole;
  readonly exp: number;
  readonly typ: 'access' | 'refresh';
}

const demoUsers: readonly AuthUser[] = [
  {
    id: '90000000-0000-4000-8000-000000000001',
    email: 'dirigente@refcheckid.local',
    password: 'Password123!',
    role: 'manager',
    displayName: 'Dirigente Demo',
    enabled: true,
    clubIds: [pilotIds.homeClub],
    federationIds: [pilotIds.federation],
  },
  {
    id: '90000000-0000-4000-8000-000000000005',
    email: 'dirigenteospite@refcheckid.local',
    password: 'Password123!',
    role: 'manager',
    displayName: 'Dirigente Ospite Demo',
    enabled: true,
    clubIds: [pilotIds.awayClub],
    federationIds: [pilotIds.federation],
  },
  {
    id: '90000000-0000-4000-8000-000000000002',
    email: 'arbitro@refcheckid.local',
    password: 'Password123!',
    role: 'referee',
    displayName: 'Arbitro Demo',
    enabled: true,
    federationIds: [pilotIds.federation],
    refereeIds: [pilotIds.referee],
    authorizedMatchIds: [pilotIds.match],
  },
  {
    id: '90000000-0000-4000-8000-000000000003',
    email: 'federazione@refcheckid.local',
    password: 'Password123!',
    role: 'federation',
    displayName: 'Federazione Demo',
    enabled: true,
    federationIds: [pilotIds.federation],
  },
  {
    id: '90000000-0000-4000-8000-000000000004',
    email: 'disabilitato@refcheckid.local',
    password: 'Password123!',
    role: 'manager',
    displayName: 'Account Disabilitato',
    enabled: false,
    clubIds: [pilotIds.homeClub],
    federationIds: [pilotIds.federation],
  },
];

const accessTokenTtlSeconds = 15 * 60;
const refreshTokenTtlSeconds = 7 * 24 * 60 * 60;

export const loginHandler: ApiHandler = async (request) => {
  if (cloudEnabled()) return cloudSession(request, 'password');
  const credentials = parseCredentials(request.body);
  const user = getUsers().find((candidate) => candidate.email === credentials.email.toLowerCase());

  const passwordMatches = user ? verifyPassword(user, credentials.password) : false;

  if (user === undefined) {
    return authError('USER_NOT_FOUND', 'Utente inesistente.');
  }

  if (!user.enabled) {
    return authError('ACCOUNT_DISABLED', 'Account disabilitato.');
  }

  if (!passwordMatches) {
    return authError('INVALID_CREDENTIALS', 'Credenziali errate.');
  }

  return json(200, await createSessionResponse(user));
};

export const refreshHandler: ApiHandler = async (request) => {
  if (cloudEnabled()) return cloudSession(request, 'refresh_token');
  const refreshToken = parseRefreshToken(request.body);
  const payload = await verifyToken(refreshToken, 'refresh');

  if (payload === null) {
    return authError('INVALID_CREDENTIALS', 'Sessione scaduta. Accedi di nuovo.');
  }

  const user = getUsers().find((candidate) => candidate.id === payload.sub);
  if (user === undefined) {
    return authError('USER_NOT_FOUND', 'Utente inesistente.');
  }

  if (!user.enabled) {
    return authError('ACCOUNT_DISABLED', 'Account disabilitato.');
  }

  if (payload.sid) await requestContext.getStore()?.store?.put('auth_sessions', { id: payload.sid, revoked: true });
  return json(200, await createSessionResponse(user));
};

export const meHandler: ApiHandler = async (request) => {
  if (cloudEnabled()) return cloudMe(request);
  if (request.auth === undefined) {
    return json(401, { error: 'UNAUTHENTICATED', message: 'Sessione richiesta.' });
  }

  const user = getUsers().find((candidate) => candidate.id === request.auth?.actorId);
  if (user === undefined) {
    return authError('USER_NOT_FOUND', 'Utente inesistente.');
  }

  return json(200, toPublicUser(user));
};

export const logoutHandler: ApiHandler = async (request) => {
  if (cloudEnabled()) return cloudLogout(request);
  const store = requestContext.getStore()?.store;
  const refresh = await verifyToken(parseRefreshToken(request.body), 'refresh');
  const id = request.auth?.sessionId ?? refresh?.sid;
  if (id && store) await store.put('auth_sessions', { id, revoked: true });
  return json(204, null);
};

export async function authenticateBearerToken(authorizationHeader: string | undefined): Promise<AuthContext | null> {
  if (cloudEnabled()) return authenticateSupabaseToken(authorizationHeader);
  if (authorizationHeader === undefined || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }

  const payload = await verifyToken(authorizationHeader.slice('Bearer '.length), 'access');
  if (payload === null) {
    return null;
  }

  const user = getUsers().find((candidate) => candidate.id === payload.sub);
  if (user === undefined || !user.enabled) return null;

  return { ...toAuthContext(user), ...(payload.sid ? { sessionId: payload.sid } : {}) };
}

async function createSessionResponse(user: AuthUser) {
  const sid = randomUUID();
  await requestContext.getStore()?.store?.put('auth_sessions', { id: sid, revoked: false, expiresAt: nowSeconds() + refreshTokenTtlSeconds });
  const accessToken = signToken(user, 'access', accessTokenTtlSeconds, sid);
  const refreshToken = signToken(user, 'refresh', refreshTokenTtlSeconds, sid);

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date((nowSeconds() + accessTokenTtlSeconds) * 1000).toISOString(),
    user: toPublicUser(user),
  };
}

function toPublicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    clubIds: user.clubIds ?? [],
    federationIds: user.federationIds ?? [],
    refereeIds: user.refereeIds ?? [],
    authorizedMatchIds: user.authorizedMatchIds ?? [],
  };
}

function toAuthContext(user: AuthUser): AuthContext {
  return {
    displayName: user.displayName,
    actorId: user.id,
    roles: [user.role],
    clubIds: user.clubIds ?? [],
    federationIds: user.federationIds ?? [],
    refereeIds: user.refereeIds ?? [],
    authorizedMatchIds: user.authorizedMatchIds ?? [],
  };
}

function parseCredentials(body: unknown): { email: string; password: string } {
  if (typeof body !== 'object' || body === null) {
    return { email: '', password: '' };
  }

  const candidate = body as Record<string, unknown>;
  return {
    email: typeof candidate.email === 'string' ? candidate.email.trim() : '',
    password: typeof candidate.password === 'string' ? candidate.password : '',
  };
}

function parseRefreshToken(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    return '';
  }

  const candidate = body as Record<string, unknown>;
  return typeof candidate.refreshToken === 'string' ? candidate.refreshToken : '';
}

function signToken(user: AuthUser, type: TokenPayload['typ'], ttlSeconds: number, sid: string): string {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: nowSeconds() + ttlSeconds,
    typ: type,
    sid,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

async function verifyToken(token: string, expectedType: TokenPayload['typ']): Promise<TokenPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, signature] = parts;
    if (!safeEqual(signature, createSignature(encodedPayload))) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
    if (payload.typ !== expectedType || typeof payload.sub !== 'string' || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds()) return null;
    const store = requestContext.getStore()?.store;
    const session = payload.sid ? await store?.get<{ revoked: boolean }>('auth_sessions', payload.sid) : null;
    if (session?.revoked || (process.env.NODE_ENV === 'production' && store && !session)) return null;
    return payload;
  } catch { return null; }
}

function createSignature(encodedPayload: string): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? 'refcheckid-dev-secret')
    .update(encodedPayload)
    .digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function authError(error: AuthErrorCode, message: string) {
  return json(401, { error: process.env.NODE_ENV === 'production' ? 'INVALID_CREDENTIALS' : error, message: process.env.NODE_ENV === 'production' ? 'Credenziali non valide.' : message, requestId: randomUUID() });
}

function getUsers(): readonly AuthUser[] {
  if (!process.env.AUTH_USERS_FILE) {
    if (process.env.NODE_ENV === 'production') throw new Error('AUTH_USERS_FILE is required in production.');
    return demoUsers;
  }
  const users: unknown = JSON.parse(readFileSync(process.env.AUTH_USERS_FILE, 'utf8'));
  if (!Array.isArray(users) || users.some((candidate: unknown) => {
    if (typeof candidate !== 'object' || candidate === null) return true;
    const user = candidate as Record<string, unknown>;
    return typeof user.id !== 'string' || typeof user.email !== 'string' || typeof user.role !== 'string' || !['manager', 'referee', 'federation', 'admin'].includes(user.role) || typeof user.passwordHash !== 'string' || !/^scrypt\$[a-f0-9]{64}\$[a-f0-9]{128}$/.test(user.passwordHash) || typeof user.enabled !== 'boolean' || ['clubIds', 'federationIds', 'refereeIds', 'authorizedMatchIds'].some((key) => user[key] !== undefined && (!Array.isArray(user[key]) || (user[key] as unknown[]).some((id) => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))));
  })) throw new Error('Invalid user directory.');
  return users as AuthUser[];
}

export function validateAuthConfiguration(): void {
  if (cloudEnabled()) return;
  if (process.env.NODE_ENV === 'production' && getUsers().length === 0) throw new Error('At least one configured user is required.');
}

function verifyPassword(user: AuthUser, password: string): boolean {
  if (user.passwordHash) {
    const [algorithm, salt, hash] = user.passwordHash.split('$');
    if (algorithm !== 'scrypt' || !salt || !hash) return false;
    return safeEqual(scryptSync(password, salt, 64).toString('hex'), hash);
  }
  return process.env.NODE_ENV !== 'production' && safeEqual(user.password ?? '', password);
}
