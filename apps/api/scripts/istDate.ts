/** Today's date in India Standard Time plus a whole number of days, as YYYY-MM-DD. */
export function istDate(daysFromToday: number, now: Date = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}
