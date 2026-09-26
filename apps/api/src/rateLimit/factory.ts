import type { NextFunction, Request, Response } from 'express';
import { RateLimiterPostgres, type RateLimiterRes } from 'rate-limiter-flexible';
import { pool } from '../db/client.js';
import { AppError } from '../errors/AppError.js';

export interface RateLimiterOptions {
  points: number;
  duration: number;
  /** Seconds to block the key entirely once points are exhausted, independent
   * of the normal window reset (e.g. the "then a 15-minute lockout" case). */
  blockDuration?: number;
  keyPrefix: string;
  keyFn: (req: Request) => string;
}

/**
 * The table is created via a drizzle migration (db/schema/rateLimit.ts), not
 * the library's own runtime DDL — tableCreated: true skips that.
 */
export function createRateLimiter(opts: RateLimiterOptions) {
  const limiter = new RateLimiterPostgres({
    storeClient: pool,
    tableName: 'rate_limiter_points',
    tableCreated: true,
    points: opts.points,
    duration: opts.duration,
    blockDuration: opts.blockDuration,
    keyPrefix: opts.keyPrefix,
  });

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await limiter.consume(opts.keyFn(req));
      next();
    } catch (rejOrErr) {
      // consume() rejects with a RateLimiterRes (not an Error) when the limit
      // is exceeded; a real infra failure rejects with the raw driver error.
      if (rejOrErr instanceof Error) {
        next(rejOrErr);
        return;
      }
      const { msBeforeNext } = rejOrErr as RateLimiterRes;
      res.set('Retry-After', String(Math.ceil(msBeforeNext / 1000)));
      next(new AppError('RATE_LIMITED', 429, 'Too many requests'));
    }
  };
}
