/**
 * Pure: the age to show today. Only the age given and the moment it was given are stored
 * (REPLACEMENT_PLAN 2.4), so the age rises by one on each anniversary of that moment.
 */
export function currentAge(age: number, recordedAt: Date, now: Date): number {
  let years = now.getUTCFullYear() - recordedAt.getUTCFullYear();
  const anniversary = new Date(recordedAt.getTime());
  anniversary.setUTCFullYear(recordedAt.getUTCFullYear() + years);
  if (anniversary.getTime() > now.getTime()) years -= 1;
  return age + Math.max(0, years);
}
