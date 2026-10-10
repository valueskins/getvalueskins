import type { EmailLogStatus, EmailTemplate } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLog } from '../db/schema/index.js';
import type { Env } from '../env/index.js';
import { logger } from '../logging/logger.js';
import { templateRegistry } from './templates/index.js';
import { sendConsole } from './transports/consoleTransport.js';
import { sendResend } from './transports/resendTransport.js';
import { escapeHtml, renderHtml } from './templates/layout.js';
import type { EmailContent, EmailTemplateDataMap } from './types.js';

export interface SendOptions {
  cc?: string[];
  attachments?: { filename: string; content: Buffer }[];
  dealId?: string;
  userId?: string;
}

export interface SendResult {
  status: EmailLogStatus;
  emailLogId: string;
}

/**
 * Renders `template`, logs it to email_log, and dispatches it via the
 * EMAIL_TRANSPORT-selected transport. Never throws: a broken email pipeline
 * must never break the caller's request. Callers that write DB rows related
 * to this send must call send() only after their own transaction commits
 * (SPEC 8: "sending happens after the DB transaction commits").
 */
export async function send<T extends EmailTemplate>(
  template: T,
  to: string,
  data: EmailTemplateDataMap[T],
  env: Env,
  options: SendOptions = {},
): Promise<SendResult> {
  return deliver(templateRegistry[template](data), template, to, env, options);
}

/** What an admin resend sends: a stored email row (SPEC 12). The HTML was never stored, so it is made from the text. */
export interface StoredEmail {
  template: string;
  subject: string;
  bodyText: string;
  toEmail: string;
  cc: string[] | null;
  dealId: string | null;
  userId: string | null;
}

/**
 * Sends a stored email again as a new email_log row (the original stays). The subject, text,
 * recipient and CC list are the stored ones, so the resend reads exactly like the first send.
 */
export async function resendStored(
  stored: StoredEmail,
  env: Env,
  attachments: { filename: string; content: Buffer }[] = [],
): Promise<SendResult> {
  const html = renderHtml(
    stored.bodyText
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
      .join(''),
  );
  return deliver(
    { subject: stored.subject, text: stored.bodyText, html },
    stored.template,
    stored.toEmail,
    env,
    {
      cc: stored.cc ?? undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      dealId: stored.dealId ?? undefined,
      userId: stored.userId ?? undefined,
    },
  );
}

async function deliver(
  content: EmailContent,
  template: string,
  to: string,
  env: Env,
  options: SendOptions,
): Promise<SendResult> {
  const [row] = await db
    .insert(emailLog)
    .values({
      dealId: options.dealId ?? null,
      userId: options.userId ?? null,
      toEmail: to,
      cc: options.cc ?? null,
      template,
      subject: content.subject,
      bodyText: content.text,
      attachmentNames: options.attachments?.map((a) => a.filename) ?? null,
      status: 'QUEUED',
    })
    .returning();

  if (!row) {
    throw new Error('send(): failed to insert email_log row');
  }

  try {
    const result =
      env.EMAIL_TRANSPORT === 'console'
        ? await sendConsole(to, content)
        : await sendResend(to, content, env, { cc: options.cc, attachments: options.attachments });

    if (result.ok) {
      await db
        .update(emailLog)
        .set({ status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId })
        .where(eq(emailLog.id, row.id));
      return { status: 'SENT', emailLogId: row.id };
    }

    const error = 'error' in result ? result.error : 'unknown transport failure';
    await db.update(emailLog).set({ status: 'FAILED', error }).where(eq(emailLog.id, row.id));
    return { status: 'FAILED', emailLogId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    try {
      await db
        .update(emailLog)
        .set({ status: 'FAILED', error: message })
        .where(eq(emailLog.id, row.id));
    } catch (updateErr) {
      logger.error({ err: updateErr }, 'send(): failed to record email_log failure');
    }
    return { status: 'FAILED', emailLogId: row.id };
  }
}
