/** True when a driver error is a Postgres unique violation (23505), directly or wrapped by Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (error as { code?: string } | null)?.code === '23505' || cause?.code === '23505';
}
