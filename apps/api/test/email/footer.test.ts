import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { emailLog } from '../../src/db/schema/index.js';
import { withSupportFooter } from '../../src/email/footer.js';
import { resendStored, send } from '../../src/email/send.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { buildTestEnv } from '../testEnv.js';

const env = buildTestEnv({ SUPPORT_EMAIL: 'help@example.com' });

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

describe('support footer (REPLACEMENT_PLAN 2.7)', () => {
  it('adds the support address to the text and the HTML', () => {
    const out = withSupportFooter(
      { subject: 'S', text: 'Hello.', html: '<div><p>Hello.</p></div>' },
      env,
    );
    expect(out.text).toBe('Hello.\n\nQuestions? Write to help@example.com.');
    expect(out.html).toBe(
      '<div><p>Hello.</p><p style="color:#555555;font-size:13px">Questions? Write to help@example.com.</p></div>',
    );
  });

  it('adds it only once', () => {
    const once = withSupportFooter({ subject: 'S', text: 'Hello.', html: '<div></div>' }, env);
    expect(withSupportFooter(once, env)).toEqual(once);
  });

  it('is on every email that send() logs and sends, in the stored text', async () => {
    const result = await send(
      'SIGN_IN_CODE',
      'user@example.com',
      { code: '123456', expiresInMinutes: 10 },
      env,
    );
    const [row] = await db.select().from(emailLog).where(eq(emailLog.id, result.emailLogId));

    expect(row?.bodyText.endsWith('Questions? Write to help@example.com.')).toBe(true);
  });

  it('is on a resend of an older email that had no footer, and not doubled on a newer one', async () => {
    const stored = {
      template: 'DEAL_CANCELLED',
      subject: 'Deal cancelled',
      bodyText: 'The deal was cancelled.',
      toEmail: 'user@example.com',
      cc: null,
      dealId: null,
      userId: null,
    };
    const older = await resendStored(stored, env);
    const [olderRow] = await db.select().from(emailLog).where(eq(emailLog.id, older.emailLogId));
    expect(olderRow?.bodyText).toBe(
      'The deal was cancelled.\n\nQuestions? Write to help@example.com.',
    );

    const newer = await resendStored({ ...stored, bodyText: olderRow!.bodyText }, env);
    const [newerRow] = await db.select().from(emailLog).where(eq(emailLog.id, newer.emailLogId));
    expect(newerRow?.bodyText).toBe(olderRow?.bodyText);
  });
});
