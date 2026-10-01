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
