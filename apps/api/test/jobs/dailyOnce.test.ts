import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { emailLog } from '../../src/db/schema/index.js';
import { send } from '../../src/email/send.js';
import { confirmPaymentReminderJob } from '../../src/jobs/confirmPaymentReminder.js';
import { contentOverdueJob } from '../../src/jobs/contentOverdue.js';
import { feeReminderJob } from '../../src/jobs/feeReminder.js';
import { istDayBounds } from '../../src/jobs/istDay.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { brandWithBilling, creatorWithPayout, insertDeal } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';
import { DAY, HOUR, RUN_AT, ago, insertRecord, jobCtx } from './helpers.js';

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const logs = async (template: string) =>
  (await db.select().from(emailLog)).filter((row) => row.template === template);

async function confirmedDeal() {
  const brand = await brandWithBilling();
  const deal = await insertDeal(brand.user.id, 'CONFIRMED', { confirmedAt: ago(5 * DAY) });
  return { brand, deal };
}

describe('istDayBounds', () => {
  it('is 00:00 IST to the next 00:00 IST', () => {
    const { start, end } = istDayBounds(new Date('2026-10-09T04:30:00.000Z'));
    expect(start.toISOString()).toBe('2026-10-08T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-10-09T18:30:00.000Z');
  });

  it('puts 23:59 IST and 00:00 IST in different days', () => {
    const late = istDayBounds(new Date('2026-10-09T18:29:59.000Z'));
    const next = istDayBounds(new Date('2026-10-09T18:30:00.000Z'));
    expect(late.start.toISOString()).toBe('2026-10-08T18:30:00.000Z');
    expect(next.start.toISOString()).toBe('2026-10-09T18:30:00.000Z');
  });
});

describe('at most one reminder per deal per day', () => {
  it('a second run on the same IST day sends nothing more', async () => {
    const { deal } = await confirmedDeal();

    const first = await feeReminderJob.run(jobCtx(RUN_AT));
    const second = await feeReminderJob.run(jobCtx(new Date(RUN_AT.getTime() + 6 * HOUR)));

    expect(first).toMatchObject({ sent: 1 });
    expect(second).toMatchObject({ selected: 1, alreadySent: 1 });
    expect(second.sent).toBeUndefined();
    const rows = await logs('COMMISSION_PAYMENT_REMINDER');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dealId).toBe(deal.id);
  });

  it('sends again once the IST day changes, at 00:00 IST exactly', async () => {
    await confirmedDeal();
    const lastMinute = new Date('2026-10-09T18:29:59.000Z'); // 23:59:59 IST on 9 Oct
    const midnight = new Date('2026-10-09T18:30:00.000Z'); // 00:00:00 IST on 10 Oct

    await feeReminderJob.run(jobCtx(RUN_AT));
    expect(await feeReminderJob.run(jobCtx(lastMinute))).toMatchObject({ alreadySent: 1 });
    expect(await feeReminderJob.run(jobCtx(midnight))).toMatchObject({ sent: 1 });
    expect(await logs('COMMISSION_PAYMENT_REMINDER')).toHaveLength(2);
  });

  it('records the run time as the log time, so the check and the job share one clock', async () => {
    await confirmedDeal();
    await feeReminderJob.run(jobCtx(RUN_AT));
    const [row] = await logs('COMMISSION_PAYMENT_REMINDER');
    expect(row?.createdAt.toISOString()).toBe(RUN_AT.toISOString());
  });

  it('a failed send does not use up the day', async () => {
    const { brand, deal } = await confirmedDeal();
    await db.insert(emailLog).values({
      dealId: deal.id,
      userId: brand.user.id,
      toEmail: brand.user.email!,
      template: 'COMMISSION_PAYMENT_REMINDER',
      subject: 'x',
      bodyText: 'x',
      status: 'FAILED',
      createdAt: ago(HOUR),
    });

    expect(await feeReminderJob.run(jobCtx(RUN_AT))).toMatchObject({ sent: 1 });
  });

  it('a queued send (a crash mid-send) counts as sent', async () => {
    const { brand, deal } = await confirmedDeal();
    await db.insert(emailLog).values({
      dealId: deal.id,
      userId: brand.user.id,
      toEmail: brand.user.email!,
      template: 'COMMISSION_PAYMENT_REMINDER',
      subject: 'x',
      bodyText: 'x',
      status: 'QUEUED',
      createdAt: ago(HOUR),
    });

    expect(await feeReminderJob.run(jobCtx(RUN_AT))).toMatchObject({ alreadySent: 1 });
  });

  it('is per deal, per template and per recipient', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const a = await insertDeal(brand.user.id, 'CONFIRMED', { confirmedAt: ago(5 * DAY) });
    const b = await insertDeal(brand.user.id, 'CONFIRMED', { confirmedAt: ago(5 * DAY) });
    // A different template for the same deal and person does not block it.
    await send(
      'REVIEW_REMINDER',
      brand.user.email!,
      { dealShortId: a.shortId, dealTitle: 'x', daysInReview: 3 },
      buildTestEnv(),
      { dealId: a.id, userId: brand.user.id, now: RUN_AT },
    );
    // Another person's reminder for the same deal does not block it.
    await send(
      'COMMISSION_PAYMENT_REMINDER',
      creator.user.email!,
      { dealShortId: a.shortId, dealTitle: 'x', commissionTotalPaise: 1 },
      buildTestEnv(),
      { dealId: a.id, userId: creator.user.id, now: RUN_AT },
    );

    expect(await feeReminderJob.run(jobCtx(RUN_AT))).toMatchObject({ selected: 2, sent: 2 });
    expect(await feeReminderJob.run(jobCtx(RUN_AT))).toMatchObject({ alreadySent: 2 });
    const forDeals = (await logs('COMMISSION_PAYMENT_REMINDER')).filter(
      (r) => r.userId === brand.user.id,
    );
    expect(forDeals.map((r) => r.dealId).sort()).toEqual([a.id, b.id].sort());
  });

  it('the 6-hourly confirm job, run four times in a day, sends one email', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: creator.user.id });
    // Recorded on the morning of 8 Oct (IST), so it has waited over 12 hours at the first run.
    await insertRecord(deal.id, brand.user.id, 'ADVANCE', {
      recordedAt: new Date('2026-10-08T02:00:00.000Z'),
    });

    const runs = [0, 6, 12, 18].map(
      (hour) => new Date(Date.UTC(2026, 9, 8, 18, 30) + hour * HOUR), // 00:00, 06:00, 12:00, 18:00 IST on 9 Oct
    );
    const results = [];
    for (const at of runs) results.push(await confirmPaymentReminderJob.run(jobCtx(at)));

    expect(results[0]).toMatchObject({ selected: 1, sent: 1 });
    for (const later of results.slice(1))
      expect(later).toMatchObject({ selected: 1, alreadySent: 1 });
    expect(await logs('DIRECT_PAYMENT_CONFIRM_REMINDER')).toHaveLength(1);
  });

  it('content overdue goes to the brand and the creator separately, once each a day', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    await insertDeal(brand.user.id, 'ADVANCE_PAID', {
      creatorId: creator.user.id,
      contentUploadDeadline: '2026-10-01',
    });
    const at = new Date('2026-10-09T18:29:00.000Z');

    expect(await contentOverdueJob.run(jobCtx(at))).toMatchObject({ sent: 2 });
    expect(await contentOverdueJob.run(jobCtx(at))).toMatchObject({ alreadySent: 2 });
    const next = new Date(at.getTime() + DAY);
    expect(await contentOverdueJob.run(jobCtx(next))).toMatchObject({ sent: 2 });
    expect(await logs('CONTENT_OVERDUE')).toHaveLength(4);
  });

  it('send() stores the given clock as created_at, and the database clock without one', async () => {
    const env = buildTestEnv();
    const data = { code: '123456', expiresInMinutes: 10 };
    const a = await send('SIGN_IN_CODE', 'a@example.com', data, env, { now: RUN_AT });
    const b = await send('SIGN_IN_CODE', 'b@example.com', data, env);

    const [rowA] = await db.select().from(emailLog).where(eq(emailLog.id, a.emailLogId));
    const [rowB] = await db.select().from(emailLog).where(eq(emailLog.id, b.emailLogId));
    expect(rowA?.createdAt.toISOString()).toBe(RUN_AT.toISOString());
    expect(Math.abs(rowB!.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
  });
});
