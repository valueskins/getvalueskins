import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { send } from '../../src/email/send.js';
import { emailLog, users } from '../../src/db/schema/index.js';
import { db } from '../../src/db/client.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { buildTestEnv } from '../testEnv.js';

const server = setupServer();

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await resetDb();
});
afterEach(async () => {
  server.resetHandlers();
  await truncateAll();
});
afterAll(async () => {
  server.close();
  await closeDb();
});

describe('send()', () => {
  it('console transport writes a SENT email_log row', async () => {
    const env = buildTestEnv({ EMAIL_TRANSPORT: 'console' });

    const result = await send(
      'SIGN_IN_CODE',
      'user@example.com',
      {
        code: '123456',
        expiresInMinutes: 10,
      },
      env,
    );

    expect(result.status).toBe('SENT');
    const rows = await db.select().from(emailLog).where(eq(emailLog.id, result.emailLogId));
    expect(rows[0]?.status).toBe('SENT');
    expect(rows[0]?.toEmail).toBe('user@example.com');
    expect(rows[0]?.template).toBe('SIGN_IN_CODE');
    expect(rows[0]?.sentAt).not.toBeNull();
  });

  it('a failed Resend send resolves with a FAILED row, never throws', async () => {
    server.use(
      http.post('https://api.resend.com/emails', () =>
        HttpResponse.json(
          { message: 'Invalid API key', name: 'validation_error' },
          { status: 401 },
        ),
      ),
    );
    const env = buildTestEnv({ EMAIL_TRANSPORT: 'resend' });

    const result = await send(
      'SIGN_IN_CODE',
      'user@example.com',
      {
        code: '123456',
        expiresInMinutes: 10,
      },
      env,
    );

    expect(result.status).toBe('FAILED');
    const rows = await db.select().from(emailLog).where(eq(emailLog.id, result.emailLogId));
    expect(rows[0]?.status).toBe('FAILED');
    expect(rows[0]?.error).toContain('Invalid API key');
  });

  it('a successful Resend send records the provider message id', async () => {
    server.use(
      http.post('https://api.resend.com/emails', () => HttpResponse.json({ id: 'email_abc123' })),
    );
    const env = buildTestEnv({ EMAIL_TRANSPORT: 'resend' });

    const result = await send(
      'SIGN_IN_CODE',
      'user@example.com',
      {
        code: '123456',
        expiresInMinutes: 10,
      },
      env,
    );

    expect(result.status).toBe('SENT');
    const rows = await db.select().from(emailLog).where(eq(emailLog.id, result.emailLogId));
    expect(rows[0]?.providerMessageId).toBe('email_abc123');
  });

  it('sets the reply-to to SUPPORT_EMAIL and ends the text and HTML with the support line', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('https://api.resend.com/emails', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'email_reply' });
      }),
    );
    const env = buildTestEnv({ EMAIL_TRANSPORT: 'resend', SUPPORT_EMAIL: 'help@example.com' });

    await send('SIGN_IN_CODE', 'user@example.com', { code: '123456', expiresInMinutes: 10 }, env);

    expect(body.reply_to).toEqual(['help@example.com']);
    expect(String(body.text).endsWith('Questions? Write to help@example.com.')).toBe(true);
    expect(String(body.html)).toContain('Questions? Write to help@example.com.');
  });

  it('persists dealId, userId, cc, and attachment filenames', async () => {
    const env = buildTestEnv({ EMAIL_TRANSPORT: 'console' });
    const [user] = await db
      .insert(users)
      .values({ username: 'brand1', name: 'Brand One', email: 'brand1@example.com' })
      .returning();

    const result = await send(
      'ADMIN_ALERT',
      'admin@example.com',
      { subjectLine: 'Alert', details: 'details' },
      env,
      {
        cc: ['other@example.com'],
        attachments: [{ filename: 'invoice.pdf', content: Buffer.from('pdf') }],
        userId: user!.id,
      },
    );

    const rows = await db.select().from(emailLog).where(eq(emailLog.id, result.emailLogId));
    expect(rows[0]?.userId).toBe(user!.id);
    expect(rows[0]?.dealId).toBeNull();
    expect(rows[0]?.cc).toEqual(['other@example.com']);
    expect(rows[0]?.attachmentNames).toEqual(['invoice.pdf']);
  });
});
