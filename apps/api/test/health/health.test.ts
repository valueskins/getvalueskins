import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
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
