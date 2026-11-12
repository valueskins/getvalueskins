import { Resend } from 'resend';
import type { Env } from '../../env/index.js';
import type { EmailContent } from '../types.js';
import type { TransportOptions, TransportResult } from './types.js';

export type ResendSendOptions = TransportOptions;
export type ResendSendResult = TransportResult;

export async function sendResend(
  to: string,
  content: EmailContent,
  env: Env,
  options: ResendSendOptions = {},
): Promise<ResendSendResult> {
  const resend = new Resend(env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    cc: options.cc,
    subject: content.subject,
    text: content.text,
    html: content.html,
    replyTo: [env.SUPPORT_EMAIL],
    attachments: options.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  });

  if (error) {
    // The name and the HTTP status tell `deliver` whether Brevo should take over (SPEC 8).
    return {
      ok: false,
      error: error.message,
      errorName: error.name,
      ...(typeof error.statusCode === 'number' ? { status: error.statusCode } : {}),
    };
  }
  return { ok: true, providerMessageId: data?.id };
}
