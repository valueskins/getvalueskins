import express from 'express';
import request from 'supertest';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorMiddleware } from '../../src/errors/errorMiddleware.js';
import { createRateLimiter } from '../../src/rateLimit/factory.js';
import { closeDb, resetDb } from '../db/testDb.js';

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe('createRateLimiter', () => {
  it('rejects with a RateLimiterRes (not an Error) once points are exhausted', async () => {
    const middleware = createRateLimiter({
      points: 1,
      duration: 60,
      keyPrefix: 'test-unit',
      keyFn: () => 'fixed-key',
    });

    const app = express();
    app.get('/probe', middleware, (_req, res) => res.json({ ok: true }));
    app.use(errorMiddleware);

    const first = await request(app).get('/probe');
    expect(first.status).toBe(200);

    const second = await request(app).get('/probe');
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RATE_LIMITED');
    expect(second.headers['retry-after']).toBeDefined();
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('produces a real 429 through the full middleware wiring with a numeric Retry-After', async () => {
    const middleware = createRateLimiter({
      points: 2,
      duration: 60,
      keyPrefix: 'test-wiring',
      keyFn: (req) => req.ip ?? 'unknown',
    });

    const app = express();
    app.use(middleware);
    app.get('/probe', (_req, res) => res.json({ ok: true }));
    app.use(errorMiddleware);

    await request(app).get('/probe');
    await request(app).get('/probe');
    const third = await request(app).get('/probe');

    expect(third.status).toBe(429);
    expect(Number.isInteger(Number(third.headers['retry-after']))).toBe(true);
  });

  it('rejection instance is a RateLimiterRes, confirmed via direct library use', async () => {
    const { RateLimiterPostgres } = await import('rate-limiter-flexible');
    const { pool } = await import('../../src/db/client.js');

    const limiter = new RateLimiterPostgres({
      storeClient: pool,
      tableName: 'rate_limiter_points',
      tableCreated: true,
      points: 1,
      duration: 60,
      keyPrefix: 'test-direct',
    });

    await limiter.consume('direct-key');
    await expect(limiter.consume('direct-key')).rejects.toBeInstanceOf(RateLimiterRes);
  });
});
