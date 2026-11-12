import { send } from '../email/send.js';
import type { Env } from '../env/index.js';

/**
 * Admin alert A1 (SPEC 8) to DISPUTE_EMAIL. Details carry ids and reasons only, never personal data.
 * Returns false when the send came back FAILED (it never throws), so a caller can tell whether the
 * admin was reached.
 */
export async function alertAdmin(env: Env, subjectLine: string, details: string): Promise<boolean> {
  const result = await send('ADMIN_ALERT', env.DISPUTE_EMAIL, { subjectLine, details }, env);
  return result.status !== 'FAILED';
}
