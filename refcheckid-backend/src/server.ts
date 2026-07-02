import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { createRestApiRouter, type HttpMethod } from './api/index.js';
import { createApplicationContainer } from './config/application-container.js';

const defaultPort = 4000;
const allowedMethods = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export interface RuntimeServerOptions {
  readonly port?: number;
  readonly host?: string;
}

export function createRuntimeServer() {
  const router = createRestApiRouter(createApplicationContainer());

  return createServer((request, response) => {
    handleRequest(router, request, response).catch((error: unknown) => {
      writeJson(response, 500, {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unexpected runtime error.',
      });
    });
  });
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
  response.setHeader('access-control-allow-origin', process.env.CORS_ORIGIN ?? '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  response.setHeader(
    'access-control-allow-headers',
    'content-type,authorization,x-actor-id,x-roles,x-request-id,x-correlation-id',
  );
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
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
