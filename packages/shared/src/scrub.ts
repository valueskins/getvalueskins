/**
 * One scrubber for everything that leaves the API or the web app as text: log lines and Sentry
 * events (CLAUDE.md section 10). It removes email addresses, UPI IDs, bank-account-shaped digits,
 * PAN and IFSC shapes, tokens in URLs and bearer headers, wherever they sit in a string, and
 * redacts keys that name a secret. Pure, no dependencies.
 */

/** Keys whose value is never kept, at any depth (`vpa`, `upi` and `payout` keep UPI details out). */
export const SENSITIVE_KEY_PATTERN = /(secret|token|pan|account|code|vpa|upi|payout)/i;

/** Keys that hold request material and are removed from Sentry events whole. */
const REQUEST_KEYS_TO_DROP = ['cookies', 'headers', 'data', 'query_string', 'env'] as const;

// The last label must be letters, so a path like `.pnpm/router@2.2.0/` in a stack is not an address.
const EMAIL_IN_TEXT =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9-])/g;
// A UPI ID has no dot after the @ (REPLACEMENT_PLAN 2.1), so it is not caught by the email rule.
const UPI_IN_TEXT = /[A-Za-z0-9.\-_]{2,64}@[A-Za-z]{2,32}(?![A-Za-z0-9-])/g;
const PAN_IN_TEXT = /(?<![A-Za-z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Za-z0-9])/g;
const IFSC_IN_TEXT = /(?<![A-Za-z0-9])[A-Z]{4}0[A-Z0-9]{6}(?![A-Za-z0-9])/g;
// 9 to 18 digits is the shape of a bank account number. Digits inside a UUID or a word are left alone.
const ACCOUNT_IN_TEXT = /(?<![\w-])\d{9,18}(?![\w-])/g;
const SECRET_PARAM_IN_TEXT =
  /([?&;\s,{"'](?:code|token|access_token|id_token|refresh_token|state|signature|sig|secret|key|password|auth)["']?\s*[=:]\s*["']?)[^&\s"'#,}]+/gi;
const BEARER_IN_TEXT = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;

/** Replaces everything sensitive inside a string; the rest of the text is kept. */
export function scrubString(text: string): string {
  return text
    .replace(BEARER_IN_TEXT, '$1 [REDACTED]')
    .replace(SECRET_PARAM_IN_TEXT, '$1[REDACTED]')
    .replace(EMAIL_IN_TEXT, '[REDACTED_EMAIL]')
    .replace(UPI_IN_TEXT, '[REDACTED_UPI]')
    .replace(PAN_IN_TEXT, '[REDACTED_PAN]')
    .replace(IFSC_IN_TEXT, '[REDACTED_IFSC]')
    .replace(ACCOUNT_IN_TEXT, '[REDACTED_NUMBER]');
}

/** A URL or path without its query string and fragment, then scrubbed. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return scrubString(cut === -1 ? url : url.slice(0, cut));
}

/** An error as plain data: its name, scrubbed message and scrubbed stack. Nothing else is kept. */
export function scrubError(
  error: Error,
  seen: WeakSet<object> = new WeakSet(),
): Record<string, unknown> {
  seen.add(error);
  const out: Record<string, unknown> = {
    type: error.name,
    message: scrubString(error.message),
  };
  if (error.stack) out.stack = scrubString(error.stack);
  const { cause } = error as { cause?: unknown };
  if (cause instanceof Error && !seen.has(cause)) out.cause = scrubError(cause, seen);
  return out;
}

/** Deep copy with sensitive keys redacted and every string scrubbed. Circular-safe. */
export function scrubValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value instanceof Error) return scrubError(value, seen);
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return value.map((item) => scrubValue(item, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : scrubValue(val, seen);
    }
    return out;
  }
  return value;
}

type EventLike = Record<string, unknown>;

function asRecord(value: unknown): EventLike | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as EventLike) : null;
}

/**
 * Makes a Sentry event safe to send (errors only). Removes the user (and so the IP), the server
 * name, every request header, cookie, body and query string, all breadcrumbs and stack variables,
 * then scrubs every remaining string. Typed loosely so this package needs no Sentry dependency.
 */
export function scrubSentryEvent<T extends EventLike>(event: T): T {
  const draft: EventLike = { ...event };
  delete draft.user;
  delete draft.server_name;
  delete draft.breadcrumbs;
  delete draft.modules;

  const request = asRecord(draft.request);
  if (request) {
    const kept: EventLike = { ...request };
    for (const key of REQUEST_KEYS_TO_DROP) delete kept[key];
    if (typeof kept.url === 'string') kept.url = scrubUrl(kept.url);
    draft.request = kept;
  }
  if (typeof draft.transaction === 'string') draft.transaction = scrubUrl(draft.transaction);

  const exception = asRecord(draft.exception);
  if (exception && Array.isArray(exception.values)) {
    draft.exception = {
      ...exception,
      values: exception.values.map((entry) => {
        const item = asRecord(entry);
        const stacktrace = asRecord(item?.stacktrace);
        if (!item || !stacktrace || !Array.isArray(stacktrace.frames)) return entry;
        return {
          ...item,
          stacktrace: {
            ...stacktrace,
            frames: stacktrace.frames.map((frame) => {
              const rest = { ...(asRecord(frame) ?? {}) };
              delete rest.vars;
              return rest;
            }),
          },
        };
      }),
    };
  }

  return scrubValue(draft) as T;
}
