import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../env/index.js';
import { AppError } from '../errors/AppError.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Webhook and Meta callback routes verify signatures instead (SPEC 6.3). Path-prefix
 * based, so future routes under these prefixes are automatically exempt. */
export const ORIGIN_CHECK_EXEMPT_PATH_PREFIXES = ['/api/webhooks/', '/api/meta/'];

export function originCheck(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }
    if (ORIGIN_CHECK_EXEMPT_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      next();
      return;
    }
    if (req.headers.origin !== env.WEB_ORIGIN) {
      next(
        new AppError('ORIGIN_MISMATCH', 403, 'Origin header does not match the allowed web origin'),
      );
      return;
    }
    next();
  };
}
