import { AppError } from '../errors/AppError.js';

/** Meta's standard Graph API error envelope. */
export interface MetaErrorEnvelope {
  error?: { message?: string; type?: string; code?: number; fbtrace_id?: string };
}

/** What Meta says went wrong, kept so a caller can tell a dead token from a rate limit. */
export interface MetaErrorInfo {
  /** Meta's own error code, for example 190 (invalid or expired token) or 4, 17, 32, 613 (rate limits). */
  metaCode?: number;
  httpStatus?: number;
}

/** Meta error codes that mean "slow down" (application, user, page and custom rate limits). */
export const META_RATE_LIMIT_CODES: readonly number[] = [4, 17, 32, 613];
/** Meta error code for an invalid, expired or revoked access token. */
export const META_INVALID_TOKEN_CODE = 190;

/** Thrown by the Instagram HTTP client on any non-2xx or Meta-error-shaped
 * response, then caught by the OAuth callback route and mapped to a redirect. */
export class InstagramApiError extends AppError {
  readonly metaCode?: number;
  readonly httpStatus?: number;

  constructor(message: string, info: MetaErrorInfo = {}) {
    super('INSTAGRAM_AUTH_FAILED', 502, message);
    this.metaCode = info.metaCode;
    this.httpStatus = info.httpStatus;
  }

  /** Meta asked us to slow down: HTTP 429 or one of its rate limit codes. */
  get isRateLimited(): boolean {
    return (
      this.httpStatus === 429 ||
      (this.metaCode !== undefined && META_RATE_LIMIT_CODES.includes(this.metaCode))
    );
  }

  /** The stored token no longer works and a new sign-in is needed. */
  get isInvalidToken(): boolean {
    return this.metaCode === META_INVALID_TOKEN_CODE;
  }
}

/** Checks an already-parsed JSON body for Meta's error envelope and throws if
 * present; otherwise returns the body unchanged. */
export function throwIfMetaError<T>(body: T | MetaErrorEnvelope, httpStatus?: number): T {
  const maybeError = body as MetaErrorEnvelope;
  if (maybeError && typeof maybeError === 'object' && 'error' in maybeError && maybeError.error) {
    throw new InstagramApiError(maybeError.error.message ?? 'Instagram API returned an error', {
      metaCode: maybeError.error.code,
      httpStatus,
    });
  }
  return body as T;
}

/**
 * For a response that is not 2xx: throws the error Meta described, or a plain one when the body
 * has no error envelope (a rate limit answer can be an empty body), so a failed call is never
 * mistaken for a successful one.
 */
export function throwForFailedResponse(body: unknown, httpStatus: number): never {
  throwIfMetaError(body as MetaErrorEnvelope, httpStatus);
  throw new InstagramApiError(`Instagram API answered ${httpStatus}`, { httpStatus });
}
