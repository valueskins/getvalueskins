import { apiBaseUrl } from '../env';

export interface ApiErrorDetail {
  path: string;
  message: string;
}

/**
 * A failed API call. `code` is the API's error code, or `NETWORK` when the API
 * could not be reached. `message` is the API's plain-English message; pages
 * show `errorText(err)` (errors.ts), never this object directly.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];
  /** Seconds, from the Retry-After header of a 429. */
  readonly retryAfter: number | null;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    retryAfter?: number | null;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? [];
    this.retryAfter = options.retryAfter ?? null;
  }
}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function apiUrl(path: string): string {
  return `${apiBaseUrl()}/api${path}`;
}

function parseDetails(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const d = item as { path?: unknown; message?: unknown } | null;
    return typeof d?.path === 'string' && typeof d.message === 'string'
      ? [{ path: d.path, message: d.message }]
      : [];
  });
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: fall through to the generic error below.
  }
  const error = (
    body as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null
  )?.error;
  const retry = Number(response.headers.get('Retry-After'));
  return new ApiError({
    status: response.status,
    code: typeof error?.code === 'string' ? error.code : 'HTTP_ERROR',
    message: typeof error?.message === 'string' ? error.message : '',
    details: parseDetails(error?.details),
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
  });
}

/**
 * Calls the API with the session cookie. `path` is after `/api`, for example
 * `/me`. Content-Type is set only when there is a body, so GETs stay simple
 * requests (no CORS preflight). Resolves to the parsed JSON body.
 */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), init);
  } catch {
    throw new ApiError({ status: 0, code: 'NETWORK', message: '' });
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
