import type { ResendEmailResponse } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLog } from '../db/schema/index.js';
import { notFound, parseId } from '../deals/access.js';
import { renderAttachmentsByName } from '../documents/documents.service.js';
import { resendStored } from '../email/send.js';
import type { Env } from '../env/index.js';
import { logger } from '../logging/logger.js';

/**
 * POST /admin/emails/:id/resend (SPEC 12). Sends the stored subject and text again to the stored
 * recipient and CC list, with the PDFs rebuilt from the deal's invoice snapshots, as a new
 * email_log row. Attachments that cannot be rebuilt are skipped and named in `missingAttachments`.
 */
export async function resendEmail(
  env: Env,
  now: Date,
  rawId: unknown,
): Promise<ResendEmailResponse> {
  const [original] = await db
    .select()
    .from(emailLog)
    .where(eq(emailLog.id, parseId(rawId)))
    .limit(1);
  if (!original) throw notFound();

  let attachments: { filename: string; content: Buffer }[] = [];
  let missing = original.attachmentNames ?? [];
  if (original.dealId && missing.length > 0) {
    try {
      const rebuilt = await renderAttachmentsByName(original.dealId, missing, now);
      attachments = rebuilt.attachments;
      missing = rebuilt.missing;
    } catch (error) {
      // The email still goes out; the admin sees the names that were left off.
      logger.error(
        { emailId: original.id, error: error instanceof Error ? error.message : 'unknown' },
        'could not rebuild resend attachments',
      );
    }
  }

  const result = await resendStored(
    {
      template: original.template,
      subject: original.subject,
      bodyText: original.bodyText,
      toEmail: original.toEmail,
      cc: original.cc,
      dealId: original.dealId,
      userId: original.userId,
    },
    env,
    attachments,
  );
  return { emailLogId: result.emailLogId, status: result.status, missingAttachments: missing };
}
