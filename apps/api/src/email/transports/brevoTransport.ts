import type { Env } from '../../env/index.js';
import type { EmailContent } from '../types.js';
import type { TransportOptions, TransportResult } from './types.js';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 15_000;

/** `Name <address>` or a bare address, as `EMAIL_FROM` may be written, in the shape Brevo takes. */
export function parseSender(from: string): { email: string; name?: string } {
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(from);
  if (!match) return { email: from.trim() };
  const name = (match[1] ?? '').replace(/^"(.*)"$/, '$1').trim();
  return name ? { email: (match[2] ?? '').trim(), name } : { email: (match[2] ?? '').trim() };
}

/**
 * Sends one email through Brevo's transactional email API (SPEC 8), with `fetch` and no client library: the
 * same from address, reply-to, copy recipients, subject, text, HTML and attachments as the Resend
 * send. It never throws, and its error text carries only Brevo's error code and message.
 * https://developers.brevo.com/reference/sendtransacemail
 */
export async function sendBrevo(
  to: string,
  content: EmailContent,
  env: Env,
  options: TransportOptions = {},
): Promise<TransportResult> {
  const body = {
    sender: parseSender(env.EMAIL_FROM),
    to: [{ email: to }],
    ...(options.cc?.length ? { cc: options.cc.map((email) => ({ email })) } : {}),
    replyTo: { email: env.SUPPORT_EMAIL },
    subject: content.subject,
    textContent: content.text,
    htmlContent: content.html,
    ...(options.attachments?.length
      ? {
          attachment: options.attachments.map((a) => ({
            name: a.filename,
            content: a.content.toString('base64'),
          })),
        }
      : {}),
  };

  try {
    const response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await response.json().catch(() => null)) as {
      messageId?: unknown;
      code?: unknown;
      message?: unknown;
    } | null;

    if (response.ok) {
      return {
        ok: true,
        providerMessageId: typeof json?.messageId === 'string' ? json.messageId : undefined,
      };
    }
    const errorName = typeof json?.code === 'string' ? json.code : undefined;
    const message = typeof json?.message === 'string' ? json.message : 'no error message';
    return { ok: false, error: message, errorName, status: response.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.name : 'Brevo request failed',
    };
  }
}
