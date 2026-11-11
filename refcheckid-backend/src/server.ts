import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { createRestApiRouter, type HttpMethod } from './api/index.js';
import { createApplicationContainer } from './config/application-container.js';
import { validateAuthConfiguration } from './api/auth.js';

const defaultPort = 4000;
const allowedMethods = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export interface RuntimeServerOptions {
  readonly port?: number;
  readonly host?: string;
}

export function createRuntimeServer() {
  if (process.env.REFCHECKID_RUNTIME !== 'supabase' && process.env.NODE_ENV === 'production' && ((process.env.AUTH_SECRET?.length ?? 0) < 32 || !process.env.AUTH_USERS_FILE || !process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*')) {
    throw new Error('Production requires AUTH_SECRET (at least 32 characters), AUTH_USERS_FILE and an explicit CORS_ORIGIN.');
  }
  validateAuthConfiguration();
  const container = createApplicationContainer();
  const router = createRestApiRouter(container);
  const loginAttempts = new Map<string, { count: number; until: number }>();

  const server = createServer((request, response) => {
    if (request.url?.split('?')[0] === '/api/v1/auth/login') {
      const key = request.socket.remoteAddress ?? 'unknown';
      const now = Date.now();
      for (const [id, entry] of loginAttempts) if (entry.until < now) loginAttempts.delete(id);
      const entry = loginAttempts.get(key) ?? { count: 0, until: now + 60_000 };
      entry.count++;
      if (entry.count > 60 || loginAttempts.size > 1000) {
        response.setHeader('retry-after', '60');
        writeJson(response, 429, { error: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' });
        request.resume();
        return;
      }
      loginAttempts.set(key, entry);
    }
    handleRequest(router, request, response).catch((error: unknown) => {
      writeJson(response, error instanceof SyntaxError ? 400 : error instanceof RequestTooLargeError ? 413 : 500, {
        error: error instanceof SyntaxError ? 'INVALID_JSON' : error instanceof RequestTooLargeError ? 'REQUEST_TOO_LARGE' : 'INTERNAL_ERROR',
        message: 'Request could not be processed.',
      });
    });
  });
  server.on('close', () => {
    void Promise.resolve(container.store.close()).catch(() => console.error('[RefCheckID] Store close failed'));
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return server;
}

export function startRuntimeServer(options: RuntimeServerOptions = {}) {
  const port = options.port ?? readPort();
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const server = createRuntimeServer();

  server.listen(port, host, () => {
    console.log(`RefCheckID backend listening on http://${host}:${port}`);
  });

  return server;
}

async function handleRequest(
  router: ReturnType<typeof createRestApiRouter>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const method = normalizeMethod(request.method);
  if (method === null) {
    writeJson(response, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' });
    return;
  }

  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (method === 'GET' && requestUrl.pathname === '/') {
    writeText(
      response,
      200,
      [
        'RefCheckID Backend API',
        'health: /api/health',
        'openapi: /api/v1/openapi.json',
        'swagger: /api/v1/swagger',
      ].join('\n'),
    );
    return;
  }

  const apiResponse = await router.handle({
    method,
    path: requestUrl.pathname,
    headers: normalizeHeaders(request.headers),
    query: Object.fromEntries(requestUrl.searchParams.entries()),
    body: await readJsonBody(request),
  });

  const headers = { ...apiResponse.headers };
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }

  if (apiResponse.status === 204) {
    response.writeHead(204);
    response.end();
    return;
  }

  console.info('[RefCheckID][api] request handled', {
    method,
    path: requestUrl.pathname,
    status: apiResponse.status,
  });

  if (Buffer.isBuffer(apiResponse.body)) {
    response.writeHead(apiResponse.status);
    response.end(apiResponse.body);
    return;
  }

  if (typeof apiResponse.body === 'string') {
    response.writeHead(apiResponse.status);
    response.end(apiResponse.body);
    return;
  }

  writeJson(response, apiResponse.status, apiResponse.body);
}

function normalizeMethod(method: string | undefined): HttpMethod | null {
  if (method === undefined) {
    return null;
  }

  const normalized = method.toUpperCase() as HttpMethod;
  return allowedMethods.has(normalized) ? normalized : null;
}

function normalizeHeaders(headers: IncomingMessage['headers']): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(',') : value,
    ]),
  );
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') {
    return undefined;
  }

  let rawBody = '';
  for await (const chunk of request) {
    const bodyChunk = chunk as string | Buffer;
    rawBody += typeof bodyChunk === 'string' ? bodyChunk : bodyChunk.toString('utf8');
    if (Buffer.byteLength(rawBody) > 12 * 1024 * 1024) throw new RequestTooLargeError();
  }

  if (rawBody.length === 0) {
    return undefined;
  }

  if (rawBody.trim().length === 0) {
    return undefined;
  }

  return JSON.parse(rawBody) as unknown;
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('access-control-allow-origin', process.env.CORS_ORIGIN ?? '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  response.setHeader(
    'access-control-allow-headers',
    'content-type,authorization,x-refcheckid-role,x-actor-id,x-roles,x-request-id,x-correlation-id',
  );
}

class RequestTooLargeError extends Error {}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.setHeader('cache-control', 'private, no-store');
  response.setHeader('content-type', 'application/json');
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

function writeText(response: ServerResponse, status: number, body: string): void {
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.writeHead(status);
  response.end(body);
}

function readPort(): number {
  const rawPort = process.env.PORT ?? String(defaultPort);
  const port = Number.parseInt(rawPort, 10);

  if (Number.isNaN(port)) {
    return defaultPort;
  }

  return port;
}

if (process.argv[1]?.endsWith('/server.js')) {
  startRuntimeServer();
}
