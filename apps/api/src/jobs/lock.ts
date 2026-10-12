import { pool } from '../db/client.js';

export type LockResult<T> = { acquired: true; value: T } | { acquired: false };

/**
 * Runs `fn` while holding a Postgres advisory lock named `job:<name>` (SPEC 14), so two instances,
 * or a redeploy overlap, cannot run the same job at once. It takes a dedicated connection for the
 * lock, because a session-level lock belongs to one connection; `fn` uses the pool as normal.
 * It never waits: when the lock is taken, it returns `{ acquired: false }`. The lock is released
 * in `finally`, and a process that dies drops its connection, which releases it.
 */
export async function withAdvisoryLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<LockResult<T>> {
  const key = `job:${name}`;
  const client = await pool.connect();
  let destroy = false;
  try {
    const { rows } = await client.query<{ ok: boolean }>(
      'select pg_try_advisory_lock(hashtextextended($1, 0)) as ok',
      [key],
    );
    if (!rows[0]?.ok) return { acquired: false };
    try {
      return { acquired: true, value: await fn() };
    } finally {
      try {
        await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [key]);
      } catch {
        // The lock would stay with this connection, so the connection must not go back to the pool.
        destroy = true;
      }
    }
  } finally {
    client.release(destroy);
  }
}
