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
  /** The error a rejected request gets. Defaults to `RATE_LIMITED` and "Too many requests". */
  error?: { code: string; message: string };
}

function buildLimiter(opts: Omit<RateLimiterOptions, 'keyFn'>): RateLimiterPostgres {
  return new RateLimiterPostgres({
    storeClient: pool,
    tableName: 'rate_limiter_points',
    tableCreated: true,
    points: opts.points,
    duration: opts.duration,
    blockDuration: opts.blockDuration,
    keyPrefix: opts.keyPrefix,
  });
}

/**
 * consume() rejects with a RateLimiterRes (not an Error) when the limit is
 * exceeded; a real infra failure rejects with the raw driver error.
 */
function toLimitError(
  rejOrErr: unknown,
  res: Response,
  error: { code: string; message: string } = { code: 'RATE_LIMITED', message: 'Too many requests' },
): Error {
  if (rejOrErr instanceof Error) return rejOrErr;
  const { msBeforeNext } = rejOrErr as RateLimiterRes;
  res.set('Retry-After', String(Math.ceil(msBeforeNext / 1000)));
  return new AppError(error.code, 429, error.message);
}

/**
 * The table is created via a drizzle migration (db/schema/rateLimit.ts), not
 * the library's own runtime DDL — tableCreated: true skips that.
 */
export function createRateLimiter(opts: RateLimiterOptions) {
  const limiter = buildLimiter(opts);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await limiter.consume(opts.keyFn(req));
      next();
    } catch (rejOrErr) {
      next(toLimitError(rejOrErr, res, opts.error));
    }
  };
}

/**
 * For limits that must only count requests that got past validation (SPEC 13
 * publish and apply): the handler calls this when it is ready to act, instead
 * of mounting the limiter as middleware. Throws the same 429 with Retry-After.
 */
export function createKeyedLimiter(opts: Omit<RateLimiterOptions, 'keyFn'>) {
  const limiter = buildLimiter(opts);

  return async (key: string, res: Response): Promise<void> => {
    try {
      await limiter.consume(key);
    } catch (rejOrErr) {
      throw toLimitError(rejOrErr, res, opts.error);
    }
  };
}
