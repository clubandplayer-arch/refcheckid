import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ApiHandler, AuthContext } from './http.js';
import { json } from './http.js';

type UserRole = 'manager' | 'referee' | 'federation';
type AuthErrorCode = 'INVALID_CREDENTIALS' | 'USER_NOT_FOUND' | 'ACCOUNT_DISABLED';

interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly password: string;
  readonly role: UserRole;
  readonly displayName: string;
  readonly enabled: boolean;
}

interface TokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly role: UserRole;
  readonly exp: number;
  readonly typ: 'access' | 'refresh';
}

const users: readonly AuthUser[] = [
  {
    id: '90000000-0000-4000-8000-000000000001',
    email: 'dirigente@refcheckid.local',
    password: 'Password123!',
    role: 'manager',
    displayName: 'Dirigente Demo',
    enabled: true,
  },
  {
    id: '90000000-0000-4000-8000-000000000005',
    email: 'dirigenteospite@refcheckid.local',
    password: 'Password123!',
    role: 'manager',
    displayName: 'Dirigente Ospite Demo',
    enabled: true,
  },
  {
    id: '90000000-0000-4000-8000-000000000002',
    email: 'arbitro@refcheckid.local',
    password: 'Password123!',
    role: 'referee',
    displayName: 'Arbitro Demo',
    enabled: true,
  },
  {
    id: '90000000-0000-4000-8000-000000000003',
    email: 'federazione@refcheckid.local',
    password: 'Password123!',
    role: 'federation',
    displayName: 'Federazione Demo',
    enabled: true,
  },
  {
    id: '90000000-0000-4000-8000-000000000004',
    email: 'disabilitato@refcheckid.local',
    password: 'Password123!',
    role: 'manager',
    displayName: 'Account Disabilitato',
    enabled: false,
  },
];

const accessTokenTtlSeconds = 15 * 60;
const refreshTokenTtlSeconds = 7 * 24 * 60 * 60;

export const loginHandler: ApiHandler = (request) => {
  const credentials = parseCredentials(request.body);
  const user = users.find((candidate) => candidate.email === credentials.email.toLowerCase());

  const passwordMatches = user?.password === credentials.password;
  console.info('[RefCheckID][auth] login diagnostic', {
    email: credentials.email.toLowerCase(),
    passwordLength: credentials.password.length,
    passwordMatches,
    userEnabled: user?.enabled ?? null,
    userExists: user !== undefined,
    userRole: user?.role ?? null,
  });

  if (user === undefined) {
    return authError('USER_NOT_FOUND', 'Utente inesistente.');
  }

  if (!user.enabled) {
    return authError('ACCOUNT_DISABLED', 'Account disabilitato.');
  }

  if (!passwordMatches) {
    return authError('INVALID_CREDENTIALS', 'Credenziali errate.');
  }

  return json(200, createSessionResponse(user));
};

export const refreshHandler: ApiHandler = (request) => {
  const refreshToken = parseRefreshToken(request.body);
  const payload = verifyToken(refreshToken, 'refresh');

  if (payload === null) {
    return authError('INVALID_CREDENTIALS', 'Sessione scaduta. Accedi di nuovo.');
  }

  const user = users.find((candidate) => candidate.id === payload.sub);
  if (user === undefined) {
    return authError('USER_NOT_FOUND', 'Utente inesistente.');
  }

  if (!user.enabled) {
    return authError('ACCOUNT_DISABLED', 'Account disabilitato.');
  }

  return json(200, createSessionResponse(user));
};

export const meHandler: ApiHandler = (request) => {
  if (request.auth === undefined) {
    return json(401, { error: 'UNAUTHENTICATED', message: 'Sessione richiesta.' });
  }

  const user = users.find((candidate) => candidate.id === request.auth?.actorId);
  if (user === undefined) {
    return authError('USER_NOT_FOUND', 'Utente inesistente.');
  }

  return json(200, toPublicUser(user));
};

export const logoutHandler: ApiHandler = () => json(204, null);

export function authenticateBearerToken(authorizationHeader: string | undefined): AuthContext | null {
  if (authorizationHeader === undefined || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }

  const payload = verifyToken(authorizationHeader.slice('Bearer '.length), 'access');
  if (payload === null) {
    return null;
  }

  return { actorId: payload.sub, roles: [payload.role] };
}

function createSessionResponse(user: AuthUser) {
  const accessToken = signToken(user, 'access', accessTokenTtlSeconds);
  const refreshToken = signToken(user, 'refresh', refreshTokenTtlSeconds);

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

function signToken(user: AuthUser, type: TokenPayload['typ'], ttlSeconds: number): string {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: nowSeconds() + ttlSeconds,
    typ: type,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token: string, expectedType: TokenPayload['typ']): TokenPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (encodedPayload === undefined || signature === undefined) {
    return null;
  }

  if (!safeEqual(signature, createSignature(encodedPayload))) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
  if (payload.typ !== expectedType || payload.exp <= nowSeconds()) {
    return null;
  }

  return payload;
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
  return json(401, { error, message, requestId: randomUUID() });
}
