import { Resend } from 'resend';
import type { Env } from '../../env/index.js';
import type { EmailContent } from '../types.js';

export interface ResendSendOptions {
  cc?: string[];
  attachments?: { filename: string; content: Buffer }[];
}

export interface ResendSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

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
    return { ok: false, error: error.message };
  }
  return { ok: true, providerMessageId: data?.id };
}
