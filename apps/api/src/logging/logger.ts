import pino from 'pino';

const SENSITIVE_KEY_PATTERN = /(secret|token|pan|account|code)/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      } else if (typeof val === 'string' && EMAIL_PATTERN.test(val)) {
        out[key] = '[REDACTED_EMAIL]';
      } else {
        out[key] = deepRedact(val, seen);
      }
    }
    return out;
  }
  if (typeof value === 'string' && EMAIL_PATTERN.test(value)) {
    return '[REDACTED_EMAIL]';
  }
  return value;
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
  formatters: {
    log: (obj) => deepRedact(obj) as Record<string, unknown>,
  },
});
