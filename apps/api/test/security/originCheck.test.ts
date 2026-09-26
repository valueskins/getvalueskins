import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorMiddleware } from '../../src/errors/errorMiddleware.js';
import { originCheck } from '../../src/security/originCheck.js';
import { buildTestEnv } from '../testEnv.js';

function buildTestApp() {
  const env = buildTestEnv();
  const app = express();
  app.use(express.json());
  app.use(originCheck(env));
  app.get('/probe', (_req, res) => res.json({ ok: true }));
  app.post('/probe', (_req, res) => res.json({ ok: true }));
  app.use(errorMiddleware);
  return { app, webOrigin: env.WEB_ORIGIN };
}

describe('originCheck', () => {
  it('allows GET requests regardless of Origin', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/probe');
    expect(response.status).toBe(200);
  });

  it('allows a mutating request with a matching Origin', async () => {
    const { app, webOrigin } = buildTestApp();
    const response = await request(app).post('/probe').set('Origin', webOrigin);
    expect(response.status).toBe(200);
  });

  it('rejects a mutating request with a mismatched Origin', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/probe').set('Origin', 'https://evil.example.com');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_MISMATCH');
  });

  it('rejects a mutating request with no Origin header at all', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/probe');
    expect(response.status).toBe(403);
  });

  it('exempts a path prefix even with a mismatched Origin', async () => {
    const env = buildTestEnv();
    const app = express();
    app.use(express.json());
    app.use(originCheck(env));
    app.post('/api/webhooks/razorpay', (_req, res) => res.json({ ok: true }));
    app.use(errorMiddleware);

    const response = await request(app)
      .post('/api/webhooks/razorpay')
      .set('Origin', 'https://evil.example.com');
    expect(response.status).toBe(200);
  });
});
