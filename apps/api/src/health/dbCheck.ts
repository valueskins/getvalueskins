import type { Pool } from 'pg';

/** Pure and unit-testable in isolation: a real SELECT 1 via the raw pg.Pool,
 * never mocked (CLAUDE.md: never mock the DB). */
export async function checkDbHealth(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
