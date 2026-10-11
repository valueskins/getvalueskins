export const DEAL_STATUSES = [
  'DRAFT',
  'OPEN',
  'CONFIRMED',
  'COMMISSION_PAID',
  'ADVANCE_PAID',
  'CONTENT_UPLOADED',
  'REVISION_REQUESTED',
  'APPROVED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number];

/**
 * Who may perform a deal-status transition. Distinct from deal_events.actor_type
 * (USER | SYSTEM | ADMIN, see enums.ts) — that's how an audit-log row categorizes
 * an actor, not who is allowed to act. Mapping BRAND/CREATOR -> USER is the API's job.
 */
export const ACTOR_ROLES = ['BRAND', 'CREATOR', 'SYSTEM', 'ADMIN'] as const;

export type ActorRole = (typeof ACTOR_ROLES)[number];

export interface DealTransition {
  readonly from: DealStatus;
  readonly to: DealStatus;
  readonly roles: readonly ActorRole[];
}

/**
 * The only allowed deal-status transitions (SPEC 5.2). DRAFT -> (deleted) is not
 * included: deleting a draft removes the row, it isn't a transition to another status.
 */
export const DEAL_TRANSITIONS: readonly DealTransition[] = [
  { from: 'DRAFT', to: 'OPEN', roles: ['BRAND'] },
  { from: 'OPEN', to: 'CONFIRMED', roles: ['BRAND'] },
  { from: 'OPEN', to: 'CANCELLED', roles: ['BRAND'] },
  { from: 'CONFIRMED', to: 'COMMISSION_PAID', roles: ['SYSTEM'] },
  { from: 'CONFIRMED', to: 'CANCELLED', roles: ['BRAND'] },
  // The creator confirms the direct UPI payment arrived (REPLACEMENT_PLAN 2.1): never the brand's claim.
  { from: 'COMMISSION_PAID', to: 'ADVANCE_PAID', roles: ['CREATOR'] },
  { from: 'ADVANCE_PAID', to: 'CONTENT_UPLOADED', roles: ['CREATOR'] },
  { from: 'CONTENT_UPLOADED', to: 'REVISION_REQUESTED', roles: ['BRAND'] },
  { from: 'CONTENT_UPLOADED', to: 'APPROVED', roles: ['BRAND'] },
  { from: 'REVISION_REQUESTED', to: 'CONTENT_UPLOADED', roles: ['CREATOR'] },
  { from: 'APPROVED', to: 'COMPLETED', roles: ['CREATOR'] },
  { from: 'COMMISSION_PAID', to: 'CANCELLED', roles: ['ADMIN'] },
  { from: 'ADVANCE_PAID', to: 'CANCELLED', roles: ['ADMIN'] },
  { from: 'CONTENT_UPLOADED', to: 'CANCELLED', roles: ['ADMIN'] },
  { from: 'REVISION_REQUESTED', to: 'CANCELLED', roles: ['ADMIN'] },
  { from: 'APPROVED', to: 'CANCELLED', roles: ['ADMIN'] },
];

export function canTransition(from: DealStatus, to: DealStatus, actorRole: ActorRole): boolean {
  return DEAL_TRANSITIONS.some(
    (transition) =>
      transition.from === from && transition.to === to && transition.roles.includes(actorRole),
  );
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseValidCalendarDate(dateStr: string): CalendarDate | null {
  const match = CALENDAR_DATE_PATTERN.exec(dateStr);
  if (!match || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = new Date(Date.UTC(year, month - 1, day));

  const isReal =
    result.getUTCFullYear() === year &&
    result.getUTCMonth() === month - 1 &&
    result.getUTCDate() === day;

  return isReal ? { year, month, day } : null;
}

/** True if `dateStr` is a real YYYY-MM-DD calendar date (e.g. rejects 2026-02-30). */
export function isValidCalendarDateString(dateStr: string): boolean {
  return parseValidCalendarDate(dateStr) !== null;
}

/**
 * The UTC instant of 23:59:59 IST on the given calendar date. IST is a fixed
 * UTC+5:30 offset with no DST, so this is plain arithmetic, no timezone library needed.
 */
export function endOfDayIST(dateStr: string): Date {
  const parsed = parseValidCalendarDate(dateStr);
  if (!parsed) {
    throw new RangeError(`endOfDayIST: "${dateStr}" is not a valid YYYY-MM-DD calendar date`);
  }

  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 18, 29, 59, 0));
}

/**
 * The calendar date (YYYY-MM-DD) it is in IST at `now`. A deal accepts applications
 * while its deadline date is on or after this date.
 */
export function todayIST(now: Date): string {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export interface ApplicationsOpenInput {
  status: DealStatus;
  applicationDeadline: string;
}

export function applicationsOpen(deal: ApplicationsOpenInput, now: Date): boolean {
  return deal.status === 'OPEN' && now.getTime() < endOfDayIST(deal.applicationDeadline).getTime();
}

const CONTENT_OVERDUE_STATUSES: readonly DealStatus[] = ['ADVANCE_PAID', 'REVISION_REQUESTED'];

export interface ContentOverdueInput {
  status: DealStatus;
  contentUploadDeadline: string;
}

export function contentOverdue(deal: ContentOverdueInput, now: Date): boolean {
  return (
    CONTENT_OVERDUE_STATUSES.includes(deal.status) &&
    now.getTime() > endOfDayIST(deal.contentUploadDeadline).getTime()
  );
}
