import { UPI_VPA_REGEX } from '@valueskins/shared';
import pino, { type DestinationStream } from 'pino';

// `vpa`, `upi` and `payout` keep a creator's UPI ID and the name on the account out of the logs.
const SENSITIVE_KEY_PATTERN = /(secret|token|pan|account|code|vpa|upi|payout)/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The replacement for a string that is an email address or a UPI ID, or null for any other string. */
function redactedString(value: string): string | null {
  if (EMAIL_PATTERN.test(value)) return '[REDACTED_EMAIL]';
  // A UPI ID has no dot after the @, so it is not email-shaped (REPLACEMENT_PLAN 2.1).
  if (UPI_VPA_REGEX.test(value)) return '[REDACTED_UPI]';
  return null;
}

/**
 * pino's `redact.paths` is fixed-depth per wildcard, not recursive — it can
 * cover known fixed locations but can't redact "any field named X, at any
 * depth" or "any email-shaped value." This walk covers that generally;
 * `redact.paths` below still handles the cheap, well-known fixed paths.
 */
export function deepRedact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => deepRedact(item, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = '[REDACTED]';
      } else if (typeof val === 'string' && redactedString(val) !== null) {
        out[key] = redactedString(val);
      } else {
        out[key] = deepRedact(val, seen);
      }
    }
    return out;
  }
  if (typeof value === 'string') return redactedString(value) ?? value;
  return value;
}

/** `destination` is only passed by tests, to capture log output in memory. */
export function buildLogger(destination?: DestinationStream) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[REDACTED]',
      },
      formatters: {
        log: (obj) => deepRedact(obj) as Record<string, unknown>,
      },
    },
    destination,
  );
}

export const logger = buildLogger();
