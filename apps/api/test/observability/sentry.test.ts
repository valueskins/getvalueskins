import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/AppError.js';
import { errorMiddleware } from '../../src/errors/errorMiddleware.js';
import {
  captureError,
  flushSentry,
  initSentry,
  resetSentryForTests,
  sentryEnabled,
} from '../../src/observability/sentry.js';
import { buildTestEnv } from '../testEnv.js';

/** A stand-in for Sentry's ingest host: records every request body it is sent. */
let sink: http.Server;
let received: string[] = [];
let dsn = '';

beforeAll(async () => {
  sink = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
  dsn = `http://publickey@127.0.0.1:${(sink.address() as AddressInfo).port}/1`;
});
afterEach(async () => {
  await resetSentryForTests();
  received = [];
});
afterAll(() => new Promise<void>((resolve) => sink.close(() => resolve())));

function appThatFails() {
  const app = express();
  app.use(express.json());
  app.post('/api/fail', (req) => {
    throw new Error(`could not pay ${req.body.vpa} (${req.body.email}) code=abc123`);
  });
  app.get('/api/conflict', () => {
    throw new AppError('INVALID_TRANSITION', 409, 'This deal just changed.');
  });
  app.get('/api/server-error', () => {
    throw new AppError('BROKEN', 503, 'Down');
  });
  app.use(errorMiddleware);
  return app;
}

describe('Sentry is off unless a DSN is set', () => {
  it('does nothing without a DSN: no start, no network call', async () => {
    expect(initSentry(undefined, 'test')).toBe(false);
    expect(initSentry('', 'test')).toBe(false);
    expect(sentryEnabled()).toBe(false);
    captureError(new Error('boom'), 'test');
    await flushSentry();
    expect(received).toEqual([]);
  });

  it('a request that fails still gets its 500 answer while Sentry is off', async () => {
    const res = await request(appThatFails()).post('/api/fail').send({ vpa: 'raj@okaxis' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(received).toEqual([]);
  });
});

describe('Sentry with a DSN', () => {
  it('sends one event for a 500, with no email, UPI ID, cookie, token, body or IP', async () => {
    expect(initSentry(dsn, 'staging')).toBe(true);
    const res = await request(appThatFails())
      .post('/api/fail?code=abc123&state=xyz789')
      .set('Cookie', 'vs_session=secretcookie')
      .set('Authorization', 'Bearer topsecret')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ vpa: 'raj.kumar@okaxis', email: 'someone@example.com', note: 'private note' });
    expect(res.status).toBe(500);
    await flushSentry();

    const payload = received.join('\n');
    expect(received.length).toBe(1);
    expect(payload).toContain('could not pay [REDACTED_UPI] ([REDACTED_EMAIL])');
    for (const leaked of [
      'raj.kumar@okaxis',
      'someone@example.com',
      'secretcookie',
      'topsecret',
      '203.0.113.9',
      'private note',
      'abc123',
      'xyz789',
      'vs_session',
    ]) {
      expect(payload, leaked).not.toContain(leaked);
    }
    expect(payload).toContain('"environment":"staging"');
  });

  it('does not send a 4xx that the caller caused', async () => {
    initSentry(dsn, 'staging');
    const res = await request(appThatFails()).get('/api/conflict');
    expect(res.status).toBe(409);
    await flushSentry();
    expect(received).toEqual([]);
  });

  it('sends a 5xx AppError', async () => {
    initSentry(dsn, 'staging');
    const res = await request(appThatFails()).get('/api/server-error');
    expect(res.status).toBe(503);
    await flushSentry();
    expect(received.length).toBe(1);
  });

  it('a bad DSN never stops the API: Sentry just stays off', () => {
    expect(initSentry('not a dsn', 'test')).toBe(false);
    expect(sentryEnabled()).toBe(false);
  });
});

describe('SENTRY_DSN in the environment', () => {
  it('is optional, and blank means off', () => {
    expect(buildTestEnv({ SENTRY_DSN: undefined }).SENTRY_DSN).toBeUndefined();
    expect(buildTestEnv({ SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
    expect(buildTestEnv({ SENTRY_DSN: '   ' }).SENTRY_DSN).toBeUndefined();
  });

  it('must be an https URL when set', () => {
    expect(buildTestEnv({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2' }).SENTRY_DSN).toBe(
      'https://k@o1.ingest.sentry.io/2',
    );
    expect(() => buildTestEnv({ SENTRY_DSN: 'http://k@o1.ingest.sentry.io/2' })).toThrow(
      /SENTRY_DSN/,
    );
    expect(() => buildTestEnv({ SENTRY_DSN: 'nonsense' })).toThrow(/SENTRY_DSN/);
  });
});
