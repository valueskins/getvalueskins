import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';

/**
 * pino-http's default genReqId is a per-process incrementing integer, not a
 * UUID — use crypto.randomUUID() (Node builtin, no new dependency) instead.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    if (typeof existing === 'string' && existing) return existing;
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
});
