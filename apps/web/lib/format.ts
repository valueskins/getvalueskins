// Display formats from the design handoff: dates as "30 Sep 2026", times as
// "11:59 pm", always in IST. Money comes from formatInr in @valueskins/shared.

const IST = 'Asia/Kolkata';

// Numeric parts, then fixed month names: ICU spells September "Sept" in some locales.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function parts(fmt: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

/** "30 Sep 2026" */
export function formatDate(value: string | Date): string {
  const p = parts(dateFmt, new Date(value));
  return `${p.day} ${MONTHS[Number(p.month) - 1]} ${p.year}`;
}

/** "9:12 am" */
export function formatTime(value: string | Date): string {
  const p = parts(timeFmt, new Date(value));
  return `${p.hour}:${p.minute} ${(p.dayPeriod ?? '').toLowerCase()}`;
}

/** "13 Oct 2026, 9:12 am IST" */
export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)}, ${formatTime(value)} IST`;
}

/** "Mar 2026" */
export function formatMonthYear(value: string | Date): string {
  const p = parts(dateFmt, new Date(value));
  return `${MONTHS[Number(p.month) - 1]} ${p.year}`;
}

/** "48,230" with Indian grouping. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-IN');
}

/** "3.84%" from a rate the API already gives in percent. */
export function formatPercent(rate: number): string {
  return `${rate.toFixed(2)}%`;
}
