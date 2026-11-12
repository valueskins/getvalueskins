import { eq } from 'drizzle-orm';
import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const lines: string[] = [];

// Capture everything the API logs, with the real redaction rules.
vi.mock('../../src/logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/logging/logger.js')>();
  return {
    ...actual,
    logger: actual.buildLogger({ write: (line: string) => void lines.push(line) }),
  };
});

import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { emailLog } from '../../src/db/schema/index.js';
import { send, shouldFallBackToBrevo } from '../../src/email/send.js';
import { parseSender } from '../../src/email/transports/brevoTransport.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { NOW, http as api } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';
import { adminUser } from '../admin/helpers.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const RESEND_URL = 'https://api.resend.com/emails';

const server = setupServer();
const withBrevo = buildTestEnv({ EMAIL_TRANSPORT: 'resend', BREVO_API_KEY: 'test-brevo-key' });
const withoutBrevo = buildTestEnv({ EMAIL_TRANSPORT: 'resend' });

interface BrevoBody {
  sender: { email: string; name?: string };
  to: Array<{ email: string }>;
  cc?: Array<{ email: string }>;
  replyTo: { email: string };
  subject: string;
  textContent: string;
  htmlContent: string;
  attachment?: Array<{ name: string; content: string }>;
}
let brevoCalls: Array<{ body: BrevoBody; apiKey: string | null }>;
let resendCalls: number;

const resendError = (status: number, name: string) =>
  mswHttp.post(RESEND_URL, () => {
    resendCalls += 1;
    return HttpResponse.json(
      { name, message: `Resend said ${name}`, statusCode: status },
      { status },
    );
  });
const resendOk = () =>
  mswHttp.post(RESEND_URL, () => {
    resendCalls += 1;
    return HttpResponse.json({ id: 'resend_msg_1' });
  });
const brevoOk = () =>
  mswHttp.post(BREVO_URL, async ({ request }) => {
    brevoCalls.push({
      body: (await request.json()) as BrevoBody,
      apiKey: request.headers.get('api-key'),
    });
    return HttpResponse.json({ messageId: '<brevo-msg-1@example>' }, { status: 201 });
  });
const brevoError = (status: number, code: string) =>
  mswHttp.post(BREVO_URL, async ({ request }) => {
    brevoCalls.push({
      body: (await request.json()) as BrevoBody,
      apiKey: request.headers.get('api-key'),
    });
    return HttpResponse.json({ code, message: `Brevo said ${code}` }, { status });
  });

const code = { code: '123456', expiresInMinutes: 10 };
const rowOf = async (id: string) =>
  (await db.select().from(emailLog).where(eq(emailLog.id, id)))[0]!;

beforeAll(async () => {
  // Bypass, so the test server's own requests (supertest) pass; each test asserts how often a provider was called.
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  brevoCalls = [];
  resendCalls = 0;
  lines.length = 0;
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await closeDb();
});

describe('Resend first, Brevo as overflow (SPEC 8)', () => {
  it('sends through Resend, and never calls Brevo, when Resend succeeds', async () => {
    server.use(resendOk(), brevoOk());

    const result = await send('SIGN_IN_CODE', 'user@example.com', code, withBrevo);

    expect(result.status).toBe('SENT');
    expect(brevoCalls).toHaveLength(0);
    expect(await rowOf(result.emailLogId)).toMatchObject({
      status: 'SENT',
      provider: 'resend',
      providerMessageId: 'resend_msg_1',
      error: null,
    });
  });

  it.each([
    [429, 'daily_quota_exceeded'],
    [429, 'rate_limit_exceeded'],
    [429, 'monthly_quota_exceeded'],
    [500, 'application_error'],
    [503, 'service_unavailable'],
  ])('Resend answers %i %s and Brevo sends it: SENT, provider brevo', async (status, name) => {
    server.use(resendError(status, name), brevoOk());

    const result = await send('SIGN_IN_CODE', 'user@example.com', code, withBrevo);

    expect(result.status).toBe('SENT');
    expect(resendCalls).toBe(1);
    expect(brevoCalls).toHaveLength(1);
    expect(await rowOf(result.emailLogId)).toMatchObject({
      status: 'SENT',
      provider: 'brevo',
      providerMessageId: '<brevo-msg-1@example>',
      error: null,
    });
  });

  it('records both errors when Resend fails on its side and Brevo fails too', async () => {
    server.use(resendError(500, 'application_error'), brevoError(401, 'unauthorized'));

    const result = await send('SIGN_IN_CODE', 'user@example.com', code, withBrevo);

    expect(result.status).toBe('FAILED');
    const row = await rowOf(result.emailLogId);
    expect(row).toMatchObject({ status: 'FAILED', provider: 'brevo' });
    expect(row.error).toContain('resend application_error (500): Resend said application_error');
    expect(row.error).toContain('brevo unauthorized (401): Brevo said unauthorized');
  });

  it('does not fall back without a Brevo key', async () => {
    server.use(resendError(429, 'daily_quota_exceeded'), brevoOk());

    const result = await send('SIGN_IN_CODE', 'user@example.com', code, withoutBrevo);

    expect(result.status).toBe('FAILED');
    expect(brevoCalls).toHaveLength(0);
    const row = await rowOf(result.emailLogId);
    expect(row).toMatchObject({ status: 'FAILED', provider: 'resend' });
    expect(row.error).toContain('resend daily_quota_exceeded (429)');
  });

  it.each([
    [401, 'validation_error'],
    [422, 'invalid_attachment'],
    [403, 'restricted_api_key'],
    [400, 'validation_error'],
  ])('treats Resend %i %s as final: Brevo is not called', async (status, name) => {
    server.use(resendError(status, name), brevoOk());

    const result = await send('SIGN_IN_CODE', 'user@example.com', code, withBrevo);

    expect(result.status).toBe('FAILED');
    expect(brevoCalls).toHaveLength(0);
    expect(await rowOf(result.emailLogId)).toMatchObject({ status: 'FAILED', provider: 'resend' });
  });

  it('sends the same from, reply-to, copy, subject, text, HTML and attachments to Brevo', async () => {
    server.use(resendError(429, 'daily_quota_exceeded'), brevoOk());
    const pdf = Buffer.from('%PDF-1.4 test invoice bytes', 'utf8');
    const env = buildTestEnv({
      EMAIL_TRANSPORT: 'resend',
      BREVO_API_KEY: 'test-brevo-key',
      EMAIL_FROM: 'ValueSkins <notifications@valueskins.com>',
    });

    const result = await send('SIGN_IN_CODE', 'user@example.com', code, env, {
      cc: ['copy@example.com'],
      attachments: [{ filename: 'VS-2026-27-000001.pdf', content: pdf }],
    });

    expect(result.status).toBe('SENT');
    const call = brevoCalls[0]!;
    expect(call.apiKey).toBe('test-brevo-key');
    expect(call.body).toMatchObject({
      sender: { email: 'notifications@valueskins.com', name: 'ValueSkins' },
      to: [{ email: 'user@example.com' }],
      cc: [{ email: 'copy@example.com' }],
      replyTo: { email: env.SUPPORT_EMAIL },
    });
    const row = await rowOf(result.emailLogId);
    expect(call.body.subject).toBe(row.subject);
    expect(call.body.textContent).toBe(row.bodyText);
    expect(call.body.htmlContent).toContain('<');
    expect(call.body.attachment).toEqual([
      { name: 'VS-2026-27-000001.pdf', content: pdf.toString('base64') },
    ]);
    expect(Buffer.from(call.body.attachment![0]!.content, 'base64')).toEqual(pdf);
  });

  it("an administrator's resend uses the same fallback and records the provider", async () => {
    server.use(resendError(429, 'daily_quota_exceeded'), brevoOk());
    const app = createApp(withBrevo, { now: () => NOW });
    const admin = await adminUser();
    const [original] = await db
      .insert(emailLog)
      .values({
        toEmail: 'brand@example.com',
        template: 'SIGN_IN_CODE',
        subject: 'Your code',
        bodyText: 'Your sign-in code is here.',
        status: 'FAILED',
        provider: 'resend',
        error: 'resend daily_quota_exceeded (429): limit',
      })
      .returning();

    const res = await api(app).send(
      'post',
      `/api/admin/emails/${original!.id}/resend`,
      admin.cookie,
      {},
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SENT');
    expect(brevoCalls).toHaveLength(1);
    expect(brevoCalls[0]!.body.to).toEqual([{ email: 'brand@example.com' }]);
    expect(await rowOf(res.body.emailLogId)).toMatchObject({ status: 'SENT', provider: 'brevo' });
    expect(await rowOf(original!.id)).toMatchObject({ status: 'FAILED', provider: 'resend' });
  });

  it('logs no address and no body while falling back', async () => {
    server.use(resendError(429, 'daily_quota_exceeded'), brevoError(500, 'internal_error'));

    await send(
      'SIGN_IN_CODE',
      'secret.person@example.com',
      { code: '987654', expiresInMinutes: 10 },
      withBrevo,
    );

    const logged = lines.join('\n');
    expect(logged).toContain('trying brevo');
    expect(logged).toContain('daily_quota_exceeded');
    expect(logged).not.toContain('secret.person');
    expect(logged).not.toContain('987654');
  });
});

describe('shouldFallBackToBrevo', () => {
  const key = { BREVO_API_KEY: 'k' };
  const fail = (errorName: string | undefined, status?: number) =>
    ({ ok: false, error: 'x', errorName, status }) as const;

  it('falls back for the limits and for 500 to 599, only with a key', () => {
    expect(shouldFallBackToBrevo(fail('daily_quota_exceeded', 429), key)).toBe(true);
    expect(shouldFallBackToBrevo(fail('rate_limit_exceeded', 429), key)).toBe(true);
    expect(shouldFallBackToBrevo(fail(undefined, 500), key)).toBe(true);
    expect(shouldFallBackToBrevo(fail(undefined, 599), key)).toBe(true);
    expect(shouldFallBackToBrevo(fail('daily_quota_exceeded', 429), { BREVO_API_KEY: '' })).toBe(
      false,
    );
  });

  it('does not fall back for anything else', () => {
    expect(shouldFallBackToBrevo(fail('validation_error', 400), key)).toBe(false);
    expect(shouldFallBackToBrevo(fail('invalid_attachment', 422), key)).toBe(false);
    expect(shouldFallBackToBrevo(fail(undefined, 499), key)).toBe(false);
    expect(shouldFallBackToBrevo(fail(undefined, 600), key)).toBe(false);
    expect(shouldFallBackToBrevo(fail(undefined, undefined), key)).toBe(false);
    expect(shouldFallBackToBrevo({ ok: true }, key)).toBe(false);
  });
});

describe('parseSender', () => {
  it('reads a bare address and the Name <address> form', () => {
    expect(parseSender('notifications@valueskins.com')).toEqual({
      email: 'notifications@valueskins.com',
    });
    expect(parseSender('ValueSkins <notifications@valueskins.com>')).toEqual({
      email: 'notifications@valueskins.com',
      name: 'ValueSkins',
    });
    expect(parseSender('"Value Skins" <n@valueskins.com>')).toEqual({
      email: 'n@valueskins.com',
      name: 'Value Skins',
    });
    expect(parseSender('<n@valueskins.com>')).toEqual({ email: 'n@valueskins.com' });
  });
});
