import { randomUUID } from 'node:crypto';
import { scrubUrl } from '@valueskins/shared';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';

/**
 * A request is logged as its id, method and path. Never the query string (it can carry a sign-in
 * code or state), the headers, the client address or the body (CLAUDE.md section 10).
 *
 * pino-http's default genReqId is a per-process incrementing integer, not a
 * UUID — use crypto.randomUUID() (Node builtin, no new dependency) instead.
 */
export function buildHttpLogger(base: Logger) {
  return pinoHttp({
    logger: base,
    genReqId: (req, res) => {
      const existing = req.headers['x-request-id'];
      if (typeof existing === 'string' && existing) return existing;
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    serializers: {
      // The log formatter has already turned an Error into plain, scrubbed data.
      err: (err: unknown) => err,
      req: (req: { id?: unknown; method?: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        path: scrubUrl(req.url ?? ''),
      }),
    },
    // Plain data only, so the raw response object is never walked by the log formatter.
    customSuccessObject: (
      _req: IncomingMessage,
      res: ServerResponse,
      val: { responseTime?: number },
    ) => ({
      status: res.statusCode,
      responseTime: val.responseTime,
    }),
    customErrorObject: (
      _req: IncomingMessage,
      res: ServerResponse,
      error: Error,
      val: { responseTime?: number },
    ) => ({
      err: error,
      status: res.statusCode,
      responseTime: val.responseTime,
    }),
  });
}

export const httpLogger = buildHttpLogger(logger);
