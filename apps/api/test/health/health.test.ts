import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/db/client.js';
import { checkDbHealth } from '../../src/health/dbCheck.js';
import { buildTestEnv } from '../testEnv.js';

describe('GET /api/health', () => {
  it('returns ok: true when the database is reachable', async () => {
    const app = createApp(buildTestEnv());
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

describe('GET /healthz (the Render health check)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 200 while the database is unreachable', async () => {
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('database down'));
    vi.spyOn(pool, 'connect').mockRejectedValue(new Error('database down'));
    const app = createApp(buildTestEnv());

    const healthz = await request(app).get('/healthz');
    expect(healthz.status).toBe(200);
    expect(healthz.body).toEqual({ ok: true });

    // The deeper check, for use by hand, does not answer 200 while the database is down.
    expect((await request(app).get('/api/health')).status).not.toBe(200);
  });

  it('runs no query, with or without a session cookie', async () => {
    const env = buildTestEnv();
    const app = createApp(env);
    const query = vi.spyOn(pool, 'query');
    const connect = vi.spyOn(pool, 'connect');

    await request(app).get('/healthz');
    // The real session cookie name, so a session lookup would query the database.
    await request(app)
      .get('/healthz')
      .set('Cookie', `${env.SESSION_COOKIE_NAME}=not-a-real-session`);

    expect(query).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('is not rate limited', async () => {
    const app = createApp(buildTestEnv());
    const statuses = new Set<number>();
    for (let i = 0; i < 400; i += 1) statuses.add((await request(app).get('/healthz')).status);

    expect([...statuses]).toEqual([200]);
  });
});

describe('checkDbHealth', () => {
  it('returns false for a real, unreachable Postgres connection', async () => {
    const { Pool } = await import('pg');
    const unreachablePool = new Pool({
      host: '127.0.0.1',
      port: 1, // nothing listens here
      connectionTimeoutMillis: 200,
    });

    const healthy = await checkDbHealth(unreachablePool);

    expect(healthy).toBe(false);
    await unreachablePool.end();
  });
});
