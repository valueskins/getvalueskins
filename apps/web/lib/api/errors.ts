import { ApiError, type ApiErrorDetail } from './client';

const NETWORK = 'Could not reach ValueSkins. Check your connection and try again.';
const GENERIC = 'Something went wrong. Try again.';

/** Plain text for codes whose API message is not meant for this screen. */
const BY_CODE: Record<string, string> = {
  NETWORK,
  INTERNAL_ERROR: GENERIC,
  HTTP_ERROR: GENERIC,
  UNAUTHENTICATED: 'You are signed out. Sign in again.',
  ORIGIN_MISMATCH: GENERIC,
  VALIDATION_ERROR: 'Check the highlighted fields.',
};

/**
 * The text to show for a failed call. The API's messages are written for users
 * (SPEC 16, never a raw status), so they are shown as they are, except for the
 * codes above. `overrides` lets a screen word a code for its own context.
 */
export function errorText(err: unknown, overrides: Record<string, string> = {}): string {
  if (!(err instanceof ApiError)) return GENERIC;
  const override = overrides[err.code];
  if (override) return override;
  const byCode = BY_CODE[err.code];
  if (byCode) return byCode;
  return err.message || GENERIC;
}

/** Validation messages keyed by field name, from an API error or a Zod issue list. */
export function fieldErrors(details: ApiErrorDetail[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of details) {
    const key = d.path.split('.')[0] ?? '';
    if (key && !(key in out)) out[key] = d.message;
  }
  return out;
}

/** The first message per field from a failed `schema.safeParse`. */
export function zodFieldErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  return fieldErrors(
    issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
  );
}

export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}
