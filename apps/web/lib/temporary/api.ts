import { apiBaseUrl } from './flags';

export function apiUrl(path: string): string {
  return `${apiBaseUrl()}${path}`;
}

/** fetch against the API with the session cookie. Content-Type is only set
 * when there is a body, so GETs stay simple requests (no CORS preflight). */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(apiUrl(path), { ...init, headers, credentials: 'include' });
}

/** The plain-English message the API puts in { error: { message } }, or a fallback. */
export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
    return typeof message === 'string' && message.length > 0 ? message : fallback;
  } catch {
    return fallback;
  }
}
