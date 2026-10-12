import type { DirectPaymentStage } from '@valueskins/shared';
import { db } from '../../src/db/client.js';
import { directPayments } from '../../src/db/schema/index.js';
import type { JobContext } from '../../src/jobs/types.js';
import { buildTestEnv } from '../testEnv.js';

/** 2026-10-09 10:00 IST, the time the daily 10:00 jobs run. */
export const RUN_AT = new Date('2026-10-09T04:30:00.000Z');

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** A moment `ms` before `at` (the run time by default). */
export const ago = (ms: number, at: Date = RUN_AT) => new Date(at.getTime() - ms);

/** The job context at a given moment. Pauses are skipped so tests do not wait. */
export function jobCtx(at: Date = RUN_AT, overrides: Partial<JobContext> = {}): JobContext {
  return { env: buildTestEnv(), now: () => at, sleep: async () => {}, ...overrides };
}

/** A direct payment row as the brand's "record payment" call would leave it. */
export async function insertRecord(
  dealId: string,
  brandId: string,
  stage: DirectPaymentStage,
  overrides: Partial<typeof directPayments.$inferInsert> = {},
) {
  const [row] = await db
    .insert(directPayments)
    .values({
      dealId,
      stage,
      amountPaise: stage === 'ADVANCE' ? 273_450 : 638_050,
      reference: `UTR${Math.floor(Math.random() * 1e9)}`,
      paidToVpa: 'secret.creator@okaxis',
      recordedBy: brandId,
      recordedAt: ago(13 * HOUR),
      ...overrides,
    })
    .returning();
  return row!;
}
