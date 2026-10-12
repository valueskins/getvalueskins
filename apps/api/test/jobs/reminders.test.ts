import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { deals, emailLog } from '../../src/db/schema/index.js';
import { confirmPaymentReminderJob } from '../../src/jobs/confirmPaymentReminder.js';
import { contentOverdueJob } from '../../src/jobs/contentOverdue.js';
import { feeReminderJob } from '../../src/jobs/feeReminder.js';
import { paymentDueReminderJob } from '../../src/jobs/paymentDueReminder.js';
import { reviewReminderJob } from '../../src/jobs/reviewReminder.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { brandWithBilling, creatorWithPayout, insertDeal } from '../helpers/deals.js';
import { DAY, HOUR, RUN_AT, ago, insertRecord, jobCtx } from './helpers.js';

beforeAll(resetDb);
beforeEach(truncateAll);
afterAll(closeDb);

const logFor = async (template: string) =>
  (await db.select().from(emailLog)).filter((row) => row.template === template);

describe('fee reminder (email 12)', () => {
  it('emails the brand of a deal CONFIRMED for more than 24 hours, and nobody else', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const mk = (status: Parameters<typeof insertDeal>[1], confirmedAt: Date | null) =>
      insertDeal(brand.user.id, status, { creatorId: creator.user.id, confirmedAt });

    const late = await mk('CONFIRMED', ago(24 * HOUR + 60_000));
    await mk('CONFIRMED', ago(24 * HOUR - 60_000));
    await mk('COMMISSION_PAID', ago(3 * DAY));
    await mk('CANCELLED', ago(3 * DAY));
    await mk('OPEN', null);

    const counts = await feeReminderJob.run(jobCtx());

    expect(counts).toMatchObject({ selected: 1, sent: 1 });
    const rows = await logFor('COMMISSION_PAYMENT_REMINDER');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dealId: late.id,
      userId: brand.user.id,
      toEmail: brand.user.email,
      status: 'SENT',
    });
    expect(rows[0]?.bodyText).toContain(late.shortId);
  });

  it('never changes the deal', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'CONFIRMED', { confirmedAt: ago(2 * DAY) });
    await feeReminderJob.run(jobCtx());
    const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(after?.status).toBe('CONFIRMED');
  });

  it('skips a brand with no email address and counts it', async () => {
    const brand = await brandWithBilling({ email: null });
    await insertDeal(brand.user.id, 'CONFIRMED', { confirmedAt: ago(2 * DAY) });
    const counts = await feeReminderJob.run(jobCtx());
    expect(counts).toMatchObject({ selected: 1, noEmail: 1 });
    expect(await logFor('COMMISSION_PAYMENT_REMINDER')).toHaveLength(0);
  });
});

describe('payment due reminder (email 19)', () => {
  it('selects COMMISSION_PAID without an advance record and APPROVED without a final record, after 24 hours', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const base = { creatorId: creator.user.id };

    const advanceDue = await insertDeal(brand.user.id, 'COMMISSION_PAID', {
      ...base,
      commissionPaidAt: ago(25 * HOUR),
    });
    const finalDue = await insertDeal(brand.user.id, 'APPROVED', {
      ...base,
      approvedAt: ago(25 * HOUR),
    });
    // Not yet 24 hours.
    await insertDeal(brand.user.id, 'COMMISSION_PAID', {
      ...base,
      commissionPaidAt: ago(23 * HOUR),
    });
    await insertDeal(brand.user.id, 'APPROVED', { ...base, approvedAt: ago(23 * HOUR) });
    // A payment is recorded and waits for the creator: that is the creator's reminder.
    const pending = await insertDeal(brand.user.id, 'COMMISSION_PAID', {
      ...base,
      commissionPaidAt: ago(3 * DAY),
    });
    await insertRecord(pending.id, brand.user.id, 'ADVANCE');
    // Confirmed records for the final of a deal that is APPROVED.
    const confirmed = await insertDeal(brand.user.id, 'APPROVED', {
      ...base,
      approvedAt: ago(3 * DAY),
    });
    await insertRecord(confirmed.id, brand.user.id, 'FINAL', {
      confirmedAt: ago(HOUR),
      confirmedBy: creator.user.id,
    });
    // Other statuses.
    await insertDeal(brand.user.id, 'ADVANCE_PAID', { ...base, advancePaidAt: ago(3 * DAY) });
    await insertDeal(brand.user.id, 'CANCELLED', { ...base, commissionPaidAt: ago(3 * DAY) });

    const counts = await paymentDueReminderJob.run(jobCtx());

    expect(counts).toMatchObject({ selected: 2, sent: 2 });
    const rows = await logFor('DIRECT_PAYMENT_DUE_REMINDER');
    expect(rows.map((r) => r.dealId).sort()).toEqual([advanceDue.id, finalDue.id].sort());
    expect(rows.every((r) => r.userId === brand.user.id)).toBe(true);
    const advance = rows.find((r) => r.dealId === advanceDue.id)!;
    const final = rows.find((r) => r.dealId === finalDue.id)!;
    expect(advance.bodyText).toContain('advance of ₹2,775.00');
    expect(final.bodyText).toContain('final of ₹6,475.00');
  });

  it('treats a payment marked not received as no record, so the brand is reminded again', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', {
      creatorId: creator.user.id,
      commissionPaidAt: ago(3 * DAY),
    });
    await insertRecord(deal.id, brand.user.id, 'ADVANCE', {
      disputedAt: ago(2 * HOUR),
      disputeReason: 'Nothing arrived',
    });

    const counts = await paymentDueReminderJob.run(jobCtx());

    expect(counts).toMatchObject({ selected: 1, sent: 1 });
  });

  it('does not count a record of the other stage', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const deal = await insertDeal(brand.user.id, 'APPROVED', {
      creatorId: creator.user.id,
      approvedAt: ago(3 * DAY),
    });
    await insertRecord(deal.id, brand.user.id, 'ADVANCE', {
      confirmedAt: ago(2 * DAY),
      confirmedBy: creator.user.id,
    });
    expect((await paymentDueReminderJob.run(jobCtx())).selected).toBe(1);
  });
});

describe('confirm-payment reminder (email 20)', () => {
  it('emails the creator of a record waiting more than 12 hours, and never the UPI ID', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const other = await creatorWithPayout();
    const base = (extra = {}) => ({ creatorId: creator.user.id, ...extra });

    const advance = await insertDeal(brand.user.id, 'COMMISSION_PAID', base());
    await insertRecord(advance.id, brand.user.id, 'ADVANCE', {
      recordedAt: ago(12 * HOUR + 60_000),
    });
    const final = await insertDeal(brand.user.id, 'APPROVED', base());
    await insertRecord(final.id, brand.user.id, 'FINAL', { recordedAt: ago(30 * HOUR) });

    // Too fresh.
    const fresh = await insertDeal(brand.user.id, 'COMMISSION_PAID', base());
    await insertRecord(fresh.id, brand.user.id, 'ADVANCE', { recordedAt: ago(12 * HOUR - 60_000) });
    // Already confirmed, already disputed.
    const confirmed = await insertDeal(brand.user.id, 'ADVANCE_PAID', base());
    await insertRecord(confirmed.id, brand.user.id, 'ADVANCE', {
      confirmedAt: ago(HOUR),
      confirmedBy: creator.user.id,
    });
    const disputed = await insertDeal(brand.user.id, 'COMMISSION_PAID', base());
    await insertRecord(disputed.id, brand.user.id, 'ADVANCE', {
      disputedAt: ago(HOUR),
      disputeReason: 'No',
    });
    // The deal moved away from the stage (an admin cancelled it).
    const cancelled = await insertDeal(brand.user.id, 'CANCELLED', base());
    await insertRecord(cancelled.id, brand.user.id, 'ADVANCE');
    // A record whose stage does not belong to the status.
    const mismatch = await insertDeal(brand.user.id, 'COMMISSION_PAID', base());
    await insertRecord(mismatch.id, brand.user.id, 'FINAL');
    // Another creator's deal with a fresh record is not selected either.
    const theirs = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: other.user.id });
    await insertRecord(theirs.id, brand.user.id, 'ADVANCE', { recordedAt: ago(HOUR) });

    const counts = await confirmPaymentReminderJob.run(jobCtx());

    expect(counts).toMatchObject({ selected: 2, sent: 2 });
    const rows = await logFor('DIRECT_PAYMENT_CONFIRM_REMINDER');
    expect(rows.map((r) => r.dealId).sort()).toEqual([advance.id, final.id].sort());
    expect(
      rows.every((r) => r.userId === creator.user.id && r.toEmail === creator.user.email),
    ).toBe(true);
    for (const row of rows) {
      expect(row.bodyText).not.toContain('secret.creator');
      expect(row.bodyText).not.toContain('@okaxis');
    }
    expect(rows.find((r) => r.dealId === advance.id)?.bodyText).toContain('₹2,734.50');
  });

  it('does nothing for a deal with no confirmed creator', async () => {
    const brand = await brandWithBilling();
    const deal = await insertDeal(brand.user.id, 'COMMISSION_PAID', { creatorId: null });
    await insertRecord(deal.id, brand.user.id, 'ADVANCE');
    expect((await confirmPaymentReminderJob.run(jobCtx())).selected).toBe(0);
  });
});

describe('review reminder (email 14)', () => {
  it('emails the brand of content waiting more than 3 days, with the days waited', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const mk = (status: Parameters<typeof insertDeal>[1], uploadedAt: Date) =>
      insertDeal(brand.user.id, status, {
        creatorId: creator.user.id,
        contentUploadedAt: uploadedAt,
      });

    const waiting = await mk('CONTENT_UPLOADED', ago(3 * DAY + 60_000));
    await mk('CONTENT_UPLOADED', ago(3 * DAY - 60_000));
    // Feedback was sent: the creator is the one waiting.
    await mk('REVISION_REQUESTED', ago(5 * DAY));
    await mk('APPROVED', ago(5 * DAY));
    const long = await mk('CONTENT_UPLOADED', ago(7 * DAY + 5 * HOUR));

    const counts = await reviewReminderJob.run(jobCtx());

    expect(counts).toMatchObject({ selected: 2, sent: 2 });
    const rows = await logFor('REVIEW_REMINDER');
    expect(rows.map((r) => r.dealId).sort()).toEqual([waiting.id, long.id].sort());
    expect(rows.find((r) => r.dealId === waiting.id)?.bodyText).toContain('for 3 days');
    expect(rows.find((r) => r.dealId === long.id)?.bodyText).toContain('for 7 days');
    expect(rows.every((r) => r.userId === brand.user.id)).toBe(true);
  });
});

describe('content overdue (email 13)', () => {
  // The job runs at 23:59 IST on 9 Oct 2026.
  const AT_2359 = new Date('2026-10-09T18:29:00.000Z');

  it('emails the brand and the creator of deals past the upload deadline, and not before it', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    const mk = (status: Parameters<typeof insertDeal>[1], deadline: string) =>
      insertDeal(brand.user.id, status, {
        creatorId: creator.user.id,
        contentUploadDeadline: deadline,
      });

    const yesterday = await mk('ADVANCE_PAID', '2026-10-08');
    const today = await mk('REVISION_REQUESTED', '2026-10-09');
    await mk('ADVANCE_PAID', '2026-10-10');
    await mk('CONTENT_UPLOADED', '2026-10-01');
    await mk('APPROVED', '2026-10-01');
    await mk('CANCELLED', '2026-10-01');

    const counts = await contentOverdueJob.run(jobCtx(AT_2359));

    expect(counts).toMatchObject({ selected: 2, sent: 4 });
    const rows = await logFor('CONTENT_OVERDUE');
    expect(rows).toHaveLength(4);
    for (const deal of [yesterday, today]) {
      const forDeal = rows.filter((r) => r.dealId === deal.id);
      expect(forDeal.map((r) => r.userId).sort()).toEqual([brand.user.id, creator.user.id].sort());
    }
    // Overdue deals keep their status.
    const [after] = await db.select().from(deals).where(eq(deals.id, yesterday.id));
    expect(after?.status).toBe('ADVANCE_PAID');
  });

  it('a run by hand at 10:00 does not count a deadline that is today', async () => {
    const brand = await brandWithBilling();
    const creator = await creatorWithPayout();
    await insertDeal(brand.user.id, 'ADVANCE_PAID', {
      creatorId: creator.user.id,
      contentUploadDeadline: '2026-10-09',
    });
    await insertDeal(brand.user.id, 'ADVANCE_PAID', {
      creatorId: creator.user.id,
      contentUploadDeadline: '2026-10-08',
    });
    expect((await contentOverdueJob.run(jobCtx(RUN_AT))).selected).toBe(1);
  });
});
