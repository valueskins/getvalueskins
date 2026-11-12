import type { EmailLogStatus, EmailProvider, EmailTemplate } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLog } from '../db/schema/index.js';
import type { Env } from '../env/index.js';
import { logger } from '../logging/logger.js';
import { captureError } from '../observability/sentry.js';
import { withSupportFooter } from './footer.js';
import { templateRegistry } from './templates/index.js';
import { sendBrevo } from './transports/brevoTransport.js';
import { sendConsole } from './transports/consoleTransport.js';
import { sendResend } from './transports/resendTransport.js';
import type { TransportResult } from './transports/types.js';
import { escapeHtml, renderHtml } from './templates/layout.js';
import type { EmailContent, EmailTemplateDataMap } from './types.js';

export interface SendOptions {
  cc?: string[];
  attachments?: { filename: string; content: Buffer }[];
  dealId?: string;
  userId?: string;
  /** The clock of the caller. It becomes `email_log.created_at`, so a job's "already sent today" check agrees with the job's own clock. */
  now?: Date;
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
  rawContent: EmailContent,
  template: string,
  to: string,
  env: Env,
  options: SendOptions,
): Promise<SendResult> {
  // Every email, first send or resend, ends with the support address (REPLACEMENT_PLAN 2.7).
  const content = withSupportFooter(rawContent, env);
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
      ...(options.now ? { createdAt: options.now } : {}),
    })
    .returning();

  if (!row) {
    throw new Error('send(): failed to insert email_log row');
  }

  try {
    const transportOptions = { cc: options.cc, attachments: options.attachments };
    let provider: EmailProvider = env.EMAIL_TRANSPORT;
    let result: TransportResult =
      env.EMAIL_TRANSPORT === 'console'
        ? await sendConsole(to, content)
        : await sendResend(to, content, env, transportOptions);
    let error = failureText(provider, result);

    // Resend is over its limit or down: one try through Brevo (SPEC 8). Only the error name and
    // the status are logged, never an address or a body.
    if (provider === 'resend' && shouldFallBackToBrevo(result, env)) {
      const failed = result as Extract<TransportResult, { ok: false }>;
      logger.warn(
        { template, resendError: failed.errorName, resendStatus: failed.status },
        'resend refused the email, trying brevo',
      );
      provider = 'brevo';
      result = await sendBrevo(to, content, env, transportOptions);
      if (!result.ok) error = `${error}; ${failureText(provider, result)}`;
    }

    if (result.ok) {
      await db
        .update(emailLog)
        .set({
          status: 'SENT',
          provider,
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
        })
        .where(eq(emailLog.id, row.id));
      return { status: 'SENT', emailLogId: row.id };
    }

    await db
      .update(emailLog)
      .set({ status: 'FAILED', provider, error })
      .where(eq(emailLog.id, row.id));
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
      captureError(updateErr, 'email_log update');
    }
    return { status: 'FAILED', emailLogId: row.id };
  }
}

/** The Resend error names that mean "over a limit": the daily and monthly quotas and the rate limit. */
const RESEND_LIMIT_ERRORS = new Set([
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
  'rate_limit_exceeded',
]);

/**
 * Whether a failed Resend send goes to Brevo: Resend hit a quota or the rate limit, or failed on its
 * side (HTTP status 500 to 599), and `BREVO_API_KEY` is set. Any other Resend error is final: a
 * rejected address or key would fail the same way at Brevo (SPEC 8).
 */
export function shouldFallBackToBrevo(
  result: TransportResult,
  env: Pick<Env, 'BREVO_API_KEY'>,
): boolean {
  if (result.ok || !env.BREVO_API_KEY) return false;
  if (result.errorName && RESEND_LIMIT_ERRORS.has(result.errorName)) return true;
  return result.status !== undefined && result.status >= 500 && result.status <= 599;
}

/** `resend daily_quota_exceeded (429): message`, for `email_log.error`. */
function failureText(provider: EmailProvider, result: TransportResult): string {
  if (result.ok) return '';
  const name = result.errorName ? ` ${result.errorName}` : '';
  const status = result.status !== undefined ? ` (${result.status})` : '';
  return `${provider}${name}${status}: ${result.error}`;
}
