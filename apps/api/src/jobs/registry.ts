import { cleanupJob } from './cleanup.js';
import { confirmPaymentReminderJob } from './confirmPaymentReminder.js';
import { contentOverdueJob } from './contentOverdue.js';
import { feeReminderJob } from './feeReminder.js';
import { instagramRefreshJob } from './instagramRefresh.js';
import { paymentDueReminderJob } from './paymentDueReminder.js';
import { reviewReminderJob } from './reviewReminder.js';
import type { JobDefinition } from './types.js';

/** Every scheduled job (SPEC 14), in the order of the day. */
export const JOBS: readonly JobDefinition[] = [
  instagramRefreshJob,
  cleanupJob,
  feeReminderJob,
  paymentDueReminderJob,
  reviewReminderJob,
  confirmPaymentReminderJob,
  contentOverdueJob,
];

export const JOB_TIMEZONE = 'Asia/Kolkata';

export function findJob(name: string): JobDefinition | undefined {
  return JOBS.find((job) => job.name === name);
}
