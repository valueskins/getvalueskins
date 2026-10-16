import { scrubValue } from '@valueskins/shared';
import pino, { type DestinationStream } from 'pino';

/**
 * Everything logged goes through the shared scrubber (`packages/shared/src/scrub.ts`), the same one
 * Sentry events use, so the two cannot drift: emails, UPI IDs, bank-account-shaped numbers, PAN,
 * IFSC and tokens are removed wherever they sit in a string, keys that name a secret are redacted at
 * any depth, and an Error is kept as its name, scrubbed message and scrubbed stack.
 *
 * pino's `redact.paths` is fixed-depth per wildcard, not recursive, so it only covers the cheap,
 * well-known fixed paths; the walk below covers everything else.
 */
export function deepRedact(value: unknown): unknown {
  return scrubValue(value);
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
        // Runs before the serializers, so an Error is still an Error here and is kept by scrubValue.
        log: (obj) => deepRedact(obj) as Record<string, unknown>,
      },
      // The formatter has already turned an Error into plain, scrubbed data.
      serializers: { err: (err: unknown) => err },
    },
    destination,
  );
}

export const logger = buildLogger();
