import { authenticateBearerToken } from './auth.js';
import type { ApiMiddleware } from './http.js';
import { json } from './http.js';
import { ValidationError } from './validation.js';
import { validPhotoContentToken } from './photo-content-token.js';
import { logCloudError } from '../cloud/diagnostics.js';

export const requestIdMiddleware: ApiMiddleware = (next) => async (request) => {
  const requestId = request.headers['x-request-id'] ?? randomUUID();
  const response = await next({ ...request, requestId });

  return { ...response, headers: { ...response.headers, 'x-request-id': requestId } };
};

export const correlationIdMiddleware: ApiMiddleware = (next) => async (request) => {
  const correlationId = request.headers['x-correlation-id'] ?? request.requestId ?? randomUUID();
  const response = await next({ ...request, correlationId });

  return { ...response, headers: { ...response.headers, 'x-correlation-id': correlationId } };
};

export const loggingMiddleware: ApiMiddleware = (next) => async (request) => {
  const startedAt = Date.now();
  const response = await next(request);
  const durationMs = Date.now() - startedAt;

  return {
    ...response,
    headers: { ...response.headers, 'x-response-time-ms': String(durationMs) },
  };
};

export const authenticationMiddleware: ApiMiddleware = (next) => async (request) => {
  const bearerAuth = await authenticateBearerToken(request.headers.authorization);
  if (bearerAuth !== null) {
    const selectedRole=request.headers['x-refcheckid-role'];
    if(selectedRole&&!bearerAuth.roles.includes(selectedRole))return json(403,{error:'FORBIDDEN',message:'Area non abilitata per questo account.'});
    return next({ ...request, auth: selectedRole?{...bearerAuth,roles:[selectedRole]}:bearerAuth });
  }

  return next(request);
};

export const authorizationMiddleware: ApiMiddleware = (next) => (request) => {
  if (request.path === '/api/health' ||
    request.path.startsWith('/api/docs') ||
    request.path === '/api/v1/openapi.json' ||
    request.path === '/api/v1/swagger' ||
    request.path === '/api/v1/auth/login' ||
    request.path === '/api/v1/platform/activate' ||
    (request.method==='GET'&&request.path.startsWith('/api/v1/public/')) ||
    request.path === '/api/v1/auth/refresh' ||
    request.path === '/api/v1/auth/logout' ||
    (request.method === 'GET' &&
      request.path.startsWith('/api/v1/photos/versions/') &&
      request.path.endsWith('/content') && validPhotoContentToken(request.params.id ?? '', request.query))) {
    return next(request);
  }

  if (request.auth === undefined) {
    return json(401, { error: 'UNAUTHENTICATED', message: 'Authentication is required.' });
  }

  return next(request);
};

export const errorHandlingMiddleware: ApiMiddleware = (next) => async (request) => {
  try {
    return await next(request);
  } catch (error) {
    if (error instanceof ValidationError) {
      return json(400, { error: 'VALIDATION_ERROR', field: error.field, message: error.message });
    }

    if (error instanceof Error) {
      if (process.env.REFCHECKID_RUNTIME === 'supabase' && ('severity' in error || error.name === 'SupabaseRequestError' || error.name === 'TypeError' || error.name === 'TimeoutError' || 'code' in error)) {
        const errorId = logCloudError(error, 'transaction');
        const response = json(503, { error: 'STORAGE_UNAVAILABLE', message: 'Service temporarily unavailable.' });
        return { ...response, headers: { ...response.headers, 'x-refcheckid-error-id': errorId } };
      }
      if ('code' in error && typeof error.code === 'string' && error.code.startsWith('ERR_SQLITE')) return json(503, { error: 'STORAGE_UNAVAILABLE', message: 'Storage temporarily unavailable. No command changes were committed.' });
      return json(409, { error: error.name, message: error.message });
    }

    return json(500, { error: 'INTERNAL_ERROR', message: 'Unexpected error.' });
  }
};

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
