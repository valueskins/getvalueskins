import { vi } from 'vitest';

type Handler = (body: unknown, init: RequestInit) => Response | Promise<Response>;

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function apiError(status: number, code: string, message = '', details?: unknown): Response {
  return json(status, { error: { code, message, ...(details ? { details } : {}) } });
}

/**
 * Stubs fetch, routed by "METHOD /path" after `/api` (the query string is
 * ignored). Every call is recorded with its parsed JSON body. Unknown routes
 * answer 404 NOT_FOUND.
 */
export function mockApi(routes: Record<string, Handler | Response | unknown>) {
  const calls: Array<{ key: string; body: unknown; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const key = `${init.method ?? 'GET'} ${path}`;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ key, body, init });
    const route = routes[key];
    if (route === undefined) return apiError(404, 'NOT_FOUND', 'Not found');
    if (typeof route === 'function') return (route as Handler)(body, init);
    if (route instanceof Response) return route.clone();
    return json(200, route);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, called: (key: string) => calls.filter((c) => c.key === key) };
}
