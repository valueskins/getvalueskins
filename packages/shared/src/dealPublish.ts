import { MIN_BUDGET_PAISE } from './config.js';
import { endOfDayIST, isValidCalendarDateString } from './dealStateMachine.js';
import { formatInr } from './money.js';

/** The fields of a draft that publishing needs, as stored (budget in paise). */
export interface DealPublishFields {
  title: string | null;
  description: string | null;
  budgetPaise: number | null;
  applicationDeadline: string | null;
  contentUploadDeadline: string | null;
  dealDeadline: string | null;
}

export interface DealPublishIssue {
  /** The request-body field name, matching the draft form. */
  path: string;
  message: string;
}

const DEADLINE_FIELDS = ['applicationDeadline', 'contentUploadDeadline', 'dealDeadline'] as const;

/** The names the form shows for the three deadlines, so an error names the field the user sees. */
const DEADLINE_LABELS = {
  applicationDeadline: 'Apply by',
  contentUploadDeadline: 'Content due',
  dealDeadline: 'Deal ends',
} as const;

/**
 * SPEC 5.4 and 5.5: everything a deal needs before it can go OPEN. Returns every
 * problem, empty when the draft can be published. A deadline is the end of that
 * calendar day in IST, so "in the future" means that instant is after `now` and
 * today's date is still allowed. Order: application < content upload <= deal.
 */
export function validateDealForPublish(deal: DealPublishFields, now: Date): DealPublishIssue[] {
  const issues: DealPublishIssue[] = [];

  if (!deal.title || deal.title.trim() === '') {
    issues.push({ path: 'title', message: 'Add a title' });
  }
  if (!deal.description || deal.description.trim() === '') {
    issues.push({ path: 'description', message: 'Add a description' });
  }

  if (deal.budgetPaise === null) {
    issues.push({ path: 'budgetRupees', message: 'Add a budget' });
  } else if (!Number.isSafeInteger(deal.budgetPaise) || deal.budgetPaise % 100 !== 0) {
    issues.push({ path: 'budgetRupees', message: 'The budget must be in whole rupees' });
  } else if (deal.budgetPaise < MIN_BUDGET_PAISE) {
    issues.push({
      path: 'budgetRupees',
      message: `The budget must be at least ${formatInr(MIN_BUDGET_PAISE)}`,
    });
  }

  const valid: Partial<Record<(typeof DEADLINE_FIELDS)[number], string>> = {};
  for (const field of DEADLINE_FIELDS) {
    const value = deal[field];
    if (value === null) {
      issues.push({ path: field, message: `Add a date for "${DEADLINE_LABELS[field]}"` });
    } else if (!isValidCalendarDateString(value)) {
      issues.push({ path: field, message: `"${DEADLINE_LABELS[field]}" is not a valid date` });
    } else if (endOfDayIST(value).getTime() <= now.getTime()) {
      issues.push({ path: field, message: `"${DEADLINE_LABELS[field]}" must be in the future` });
    } else {
      valid[field] = value;
    }
  }

  // ISO calendar dates compare correctly as strings.
  const { applicationDeadline: apply, contentUploadDeadline: upload, dealDeadline: end } = valid;
  if (apply !== undefined && upload !== undefined && apply >= upload) {
    issues.push({
      path: 'contentUploadDeadline',
      message: '"Content due" must be after "Apply by"',
    });
  }
  if (upload !== undefined && end !== undefined && upload > end) {
    issues.push({
      path: 'dealDeadline',
      message: '"Deal ends" must be on or after "Content due"',
    });
  }

  return issues;
}
