import type { UUID } from '../domain/index.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequest<
  TBody = unknown,
  TQuery extends Record<string, string | undefined> = Record<string, string | undefined>,
> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly headers: Record<string, string | undefined>;
  readonly params: Record<string, string | undefined>;
  readonly query: TQuery;
  readonly body?: TBody;
  readonly requestId?: UUID;
  readonly correlationId?: UUID;
  readonly auth?: AuthContext;
}

export interface AuthContext {
  readonly actorId: UUID;
  readonly roles: readonly string[];
}

export interface ApiResponse<TBody = unknown> {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body: TBody;
}

export type ApiHandler = (request: ApiRequest) => Promise<ApiResponse> | ApiResponse;
export type ApiMiddleware = (next: ApiHandler) => ApiHandler;

interface RouteDefinition {
  readonly method: HttpMethod;
  readonly path: string;
  readonly segments: readonly string[];
  readonly handler: ApiHandler;
}

export class ApiRouter {
  private readonly routes: RouteDefinition[] = [];
  private readonly middlewares: ApiMiddleware[] = [];

  use(middleware: ApiMiddleware): void {
    this.middlewares.push(middleware);
  }

  register(method: HttpMethod, path: string, handler: ApiHandler): void {
    this.routes.push({ method, path, segments: splitPath(path), handler });
  }

  async handle(
    request: Omit<ApiRequest, 'params'> & { params?: Record<string, string> },
  ): Promise<ApiResponse> {
    const match = this.matchRoute(request.method, request.path);

    if (match === null) {
      return { status: 404, body: { error: 'ROUTE_NOT_FOUND', message: 'Route not found.' } };
    }

    const handler = this.middlewares.reduceRight(
      (next, middleware) => middleware(next),
      match.route.handler,
    );

    return handler({ ...request, params: match.params });
  }

  listRoutes(): readonly Pick<RouteDefinition, 'method' | 'path'>[] {
    return this.routes.map(({ method, path }) => ({ method, path }));
  }

  private matchRoute(
    method: HttpMethod,
    path: string,
  ): { route: RouteDefinition; params: Record<string, string> } | null {
    const requestSegments = splitPath(path);

    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== requestSegments.length) {
        continue;
      }

      const params: Record<string, string> = {};
      const matched = route.segments.every((segment, index) => {
        const requestSegment = requestSegments[index];

        if (segment.startsWith(':')) {
          params[segment.slice(1)] = requestSegment;
          return true;
        }

        return segment === requestSegment;
      });

      if (matched) {
        return { route, params };
      }
    }

    return null;
  }
}

export function json<TBody>(status: number, body: TBody): ApiResponse<TBody> {
  return { status, headers: { 'content-type': 'application/json' }, body };
}

function splitPath(path: string): readonly string[] {
  return path.split('/').filter(Boolean);
}
