import { send } from '../email/send.js';
import type { Env } from '../env/index.js';

/** Admin alert A1 (SPEC 8) to DISPUTE_EMAIL. Details carry ids and reasons only, never personal data. */
export async function alertAdmin(env: Env, subjectLine: string, details: string): Promise<void> {
  await send('ADMIN_ALERT', env.DISPUTE_EMAIL, { subjectLine, details }, env);
}
