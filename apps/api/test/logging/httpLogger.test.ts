import { Writable } from 'node:stream';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildHttpLogger } from '../../src/logging/httpLogger.js';
import { buildLogger } from '../../src/logging/logger.js';

function appWithCapturedLogs() {
  vi.stubEnv('LOG_LEVEL', 'info');
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const app = express();
  app.use(buildHttpLogger(buildLogger(destination)));
  app.get('/api/auth/instagram/callback', (req, res) => {
    req.log.error({ err: new Error('could not pay raj@okaxis') }, 'handled');
    res.json({ ok: true });
  });
  app.get('/api/boom', (_req, _res, next) => next(new Error('mail to someone@example.com failed')));
  // The real error middleware logs through req.log; here pino-http's own error log is what we check.
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      (res as express.Response & { err?: Error }).err = err;
      res.status(500).json({});
    },
  );
  return { app, lines };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('request logging', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('logs the id, method, path and status, and never the query, headers, address or body', async () => {
    const { app, lines } = appWithCapturedLogs();
    await request(app)
      .get('/api/auth/instagram/callback?code=abc123&state=xyz789')
      .set('Cookie', 'vs_session=secretcookie')
      .set('Authorization', 'Bearer topsecret')
      .set('User-Agent', 'agent-007');
    await settle();

    const text = lines.join('');
    expect(text).toContain('/api/auth/instagram/callback');
    expect(text).toContain('"status":200');
    for (const leaked of [
      'abc123',
      'xyz789',
      'code=',
      'secretcookie',
      'topsecret',
      'agent-007',
      'remoteAddress',
      '127.0.0.1',
      '::1',
    ]) {
      expect(text, leaked).not.toContain(leaked);
    }
    const first = JSON.parse(lines[0] as string);
    expect(first.req).toEqual({
      id: expect.any(String),
      method: 'GET',
      path: '/api/auth/instagram/callback',
    });
  });

  it('keeps an error message and stack, with the email and UPI ID removed', async () => {
    const { app, lines } = appWithCapturedLogs();
    await request(app).get('/api/auth/instagram/callback');
    await settle();
    const entry = JSON.parse(lines[0] as string);
    expect(entry.err.message).toBe('could not pay [REDACTED_UPI]');
    expect(entry.err.stack).toContain('could not pay [REDACTED_UPI]');
    expect(lines.join('')).not.toContain('raj@okaxis');
  });

  it('logs a failed request with the scrubbed error and its status', async () => {
    const { app, lines } = appWithCapturedLogs();
    await request(app).get('/api/boom?token=abc');
    await settle();
    const text = lines.join('');
    expect(text).toContain('[REDACTED_EMAIL] failed');
    expect(text).not.toContain('someone@example.com');
    expect(text).not.toContain('token=abc');
    expect(text).toContain('"status":500');
  });
});
