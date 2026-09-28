import type { EmailLogStatus, EmailTemplate } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLog } from '../db/schema/index.js';
import type { Env } from '../env/index.js';
import { logger } from '../logging/logger.js';
import { templateRegistry } from './templates/index.js';
import { sendConsole } from './transports/consoleTransport.js';
import { sendResend } from './transports/resendTransport.js';
import type { EmailTemplateDataMap } from './types.js';

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
  const content = templateRegistry[template](data);

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
