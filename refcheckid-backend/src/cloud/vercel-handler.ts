import { createApplicationContainer } from '../config/application-container.js';
import { createRestApiRouter } from '../api/router.js';
import type { HttpMethod } from '../api/http.js';
import { CloudConfigurationError } from './config.js';
import { logCloudError } from './diagnostics.js';

let router: ReturnType<typeof createRestApiRouter> | undefined;
const methods = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

/** Web and mobile share these APIs. Local development still uses port 4000. */
export async function handleCloudRequest(request: Request): Promise<Response> {
  const common = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
  let phase: 'bootstrap' | 'request' = 'bootstrap';
  try {
    if (!methods.has(request.method)) return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: common });
    if (process.env.REFCHECKID_RUNTIME !== 'supabase') throw new CloudConfigurationError('CONFIG_RUNTIME_INVALID', 'Cloud runtime is not configured.');
    router ??= createRestApiRouter(createApplicationContainer());
    phase = 'request';
    const url = new URL(request.url);
    let body: unknown;
    if (!['GET', 'DELETE'].includes(request.method)) {
      // Photos upload directly to Supabase; never send base64 through Vercel.
      const limit = 1024 * 1024;
      if (Number(request.headers.get('content-length')) > limit) return Response.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413, headers: common });
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const chunk = await reader.read() as { done: boolean; value?: Uint8Array };
          if (chunk.done || !chunk.value) break;
          size += chunk.value.length;
          if (size > limit) { await reader.cancel(); return Response.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413, headers: common }); }
          chunks.push(chunk.value);
        }
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw.trim() ? JSON.parse(raw) : undefined;
      if (body && typeof body === 'object' && 'contentBase64' in body) return Response.json({ error: 'DIRECT_UPLOAD_REQUIRED' }, { status: 400, headers: common });
    }
    const result = await router.handle({ method: request.method as HttpMethod, path: url.pathname,
      headers: Object.fromEntries(request.headers.entries()), query: Object.fromEntries(url.searchParams), body });
    const headers = { ...common, ...result.headers };
    if (result.status === 204) return new Response(null, { status: 204, headers });
    if (Buffer.isBuffer(result.body)) return new Response(new Uint8Array(result.body), { status: result.status, headers });
    if (typeof result.body === 'string') return new Response(result.body, { status: result.status, headers });
    return Response.json(result.body, { status: result.status, headers });
  } catch (error) {
    const errorId = logCloudError(error, phase);
    return Response.json({ error: error instanceof SyntaxError ? 'INVALID_JSON' : 'SERVICE_UNAVAILABLE',
      message: 'Request could not be processed.' }, { status: error instanceof SyntaxError ? 400 : 503,
      headers: { ...common, 'x-refcheckid-error-id': errorId } });
  }
}
