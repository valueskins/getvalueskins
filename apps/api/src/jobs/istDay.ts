import { todayIST } from '@valueskins/shared';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The IST calendar day that contains `now`: from 00:00:00 IST up to, not including, the next 00:00:00 IST. */
export function istDayBounds(now: Date): { start: Date; end: Date } {
  const [year, month, day] = todayIST(now).split('-').map(Number) as [number, number, number];
  const start = new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}
