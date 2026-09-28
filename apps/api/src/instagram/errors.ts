import { AppError } from '../errors/AppError.js';

/** Meta's standard Graph API error envelope. */
export interface MetaErrorEnvelope {
  error?: { message?: string; type?: string; code?: number; fbtrace_id?: string };
}

/** Thrown by the Instagram HTTP client on any non-2xx or Meta-error-shaped
 * response, then caught by the OAuth callback route and mapped to a redirect. */
export class InstagramApiError extends AppError {
  constructor(message: string) {
    super('INSTAGRAM_AUTH_FAILED', 502, message);
  }
}

/** Checks an already-parsed JSON body for Meta's error envelope and throws if
 * present; otherwise returns the body unchanged. */
export function throwIfMetaError<T>(body: T | MetaErrorEnvelope): T {
  const maybeError = body as MetaErrorEnvelope;
  if (maybeError && typeof maybeError === 'object' && 'error' in maybeError && maybeError.error) {
    throw new InstagramApiError(maybeError.error.message ?? 'Instagram API returned an error');
  }
  return body as T;
}
