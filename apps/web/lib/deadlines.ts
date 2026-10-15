import { endOfDayIST } from '@valueskins/shared';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface Countdown {
  text: string;
  overdue: boolean;
  /** Under 24 hours left. */
  soon: boolean;
}

/**
 * A deadline is the end of that day in IST (SPEC 5.4). "8 days left", hours
 * under a day, then "Overdue by 2 days" (DESIGN_HANDOFF: money and time).
 */
export function countdown(date: string, now: Date): Countdown {
  const left = endOfDayIST(date).getTime() - now.getTime();
  if (left < 0) {
    const late = -left;
    if (late < DAY) {
      const hours = Math.max(1, Math.floor(late / HOUR));
      return {
        text: `Overdue by ${hours} ${hours === 1 ? 'hour' : 'hours'}`,
        overdue: true,
        soon: false,
      };
    }
    const days = Math.floor(late / DAY);
    return {
      text: `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`,
      overdue: true,
      soon: false,
    };
  }
  if (left < DAY) {
    const hours = Math.max(1, Math.ceil(left / HOUR));
    return { text: `${hours} ${hours === 1 ? 'hour' : 'hours'} left`, overdue: false, soon: true };
  }
  const days = Math.ceil(left / DAY);
  return { text: `${days} ${days === 1 ? 'day' : 'days'} left`, overdue: false, soon: false };
}

/** "Applications close today, 7 hours left", or null when the deadline is not today. */
export function closingToday(date: string, now: Date): string | null {
  const c = countdown(date, now);
  if (c.overdue || !c.soon) return null;
  return `Applications close today, ${c.text}`;
}

/** Published in the last 24 hours (the feed's "New" label). */
export function isNew(publishedAt: string | null, now: Date): boolean {
  if (!publishedAt) return false;
  const age = now.getTime() - new Date(publishedAt).getTime();
  return age >= 0 && age < DAY;
}

/** "2 Oct" for compact places. */
export function shortDate(date: string): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${months[(m ?? 1) - 1]}`;
}

/** "2 Oct 2026" for a YYYY-MM-DD deadline. */
export function longDate(date: string): string {
  const [y] = date.split('-');
  return `${shortDate(date)} ${y}`;
}
