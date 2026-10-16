import type { EmailTemplate } from '@valueskins/shared';
import { and, asc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLog, users } from '../db/schema/index.js';
import { send } from '../email/send.js';
import type { ApiContext } from '../context.js';
import { withAdvisoryLock } from '../jobs/lock.js';

export const LAUNCH_AUDIENCES = ['brands', 'creators'] as const;
export type LaunchAudience = (typeof LAUNCH_AUDIENCES)[number];

const AUDIENCES: Record<
  LaunchAudience,
  {
    role: 'BRAND' | 'CREATOR';
    template: Extract<EmailTemplate, 'LAUNCH_BRANDS' | 'LAUNCH_CREATORS'>;
  }
> = {
  brands: { role: 'BRAND', template: 'LAUNCH_BRANDS' },
  creators: { role: 'CREATOR', template: 'LAUNCH_CREATORS' },
};

/** Counts only. Addresses never leave the database. */
export interface LaunchNotifyResult {
  audience: LaunchAudience;
  /** false for a dry run. */
  sent: boolean;
  /** Onboarded accounts with a verified email. */
  eligible: number;
  /** Already got this notice (a non-failed `email_log` row). */
  alreadySent: number;
  /** A dry run: would be sent. A real run: attempted. */
  toSend: number;
  /** Real run only. */
  delivered: number;
  failed: number;
}

/**
 * The launch notice (SPEC 8): emails every onboarded account of one audience once. "Once" is the
 * `email_log`: an account with a non-failed row for the template is skipped, so a second run sends
 * nothing and a failed send is tried again. A QUEUED row counts as sent, because the send may have
 * happened. Two runs at once are kept apart by an advisory lock. Returns null when the lock is held.
 * Without `send` it only counts.
 */
export async function runLaunchNotify(
  ctx: ApiContext,
  args: { audience: LaunchAudience; send: boolean },
): Promise<LaunchNotifyResult | null> {
  const lock = await withAdvisoryLock('notify-launch', () => notifyAudience(ctx, args));
  return lock.acquired ? lock.value : null;
}

async function notifyAudience(
  ctx: ApiContext,
  args: { audience: LaunchAudience; send: boolean },
): Promise<LaunchNotifyResult> {
  const { role, template } = AUDIENCES[args.audience];

  const recipients = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.role, role),
        isNotNull(users.onboardingCompletedAt),
        isNotNull(users.emailVerifiedAt),
        isNotNull(users.email),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(users.id));

  const done = await db
    .select({ userId: emailLog.userId })
    .from(emailLog)
    .where(and(eq(emailLog.template, template), ne(emailLog.status, 'FAILED')));
  const alreadySentIds = new Set(done.map((r) => r.userId));

  const pending = recipients.filter((r) => !alreadySentIds.has(r.id));
  const result: LaunchNotifyResult = {
    audience: args.audience,
    sent: args.send,
    eligible: recipients.length,
    alreadySent: recipients.length - pending.length,
    toSend: pending.length,
    delivered: 0,
    failed: 0,
  };
  if (!args.send) return result;

  for (const recipient of pending) {
    if (!recipient.email) continue;
    const outcome = await send(template, recipient.email, { appUrl: ctx.env.WEB_ORIGIN }, ctx.env, {
      userId: recipient.id,
      now: ctx.now(),
    });
    if (outcome.status === 'FAILED') result.failed += 1;
    else result.delivered += 1;
  }
  return result;
}
