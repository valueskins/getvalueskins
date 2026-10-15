import { formatTime } from './format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const istParts = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

function ist(value: string | Date) {
  const p = Object.fromEntries(
    istParts.formatToParts(new Date(value)).map((x) => [x.type, x.value]),
  );
  return { day: p.day, month: MONTHS[Number(p.month) - 1], year: p.year };
}

/** "2 Oct" in IST. */
export function formatShortDateTime(value: string | Date): string {
  const p = ist(value);
  return `${p.day} ${p.month}`;
}

/** "2 Oct, 6:10 pm" in IST. */
export function formatDayTime(value: string | Date): string {
  return `${formatShortDateTime(value)}, ${formatTime(value)}`;
}

/** "2 Oct 2026, 6:10 pm" in IST. */
export function formatFullDayTime(value: string | Date): string {
  const p = ist(value);
  return `${p.day} ${p.month} ${p.year}, ${formatTime(value)}`;
}
