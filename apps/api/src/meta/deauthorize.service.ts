import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';

/**
 * The access token Meta issued for this user is now dead the moment they
 * deauthorize — clear it so the daily refresh cron never retries it, without
 * touching the account, sessions, or any other data (that's data-deletion's
 * job, not deauthorize's). instagram_user_id is kept so a future Instagram
 * re-login still resolves to this same user via upsert-by-instagram_user_id.
 */
export async function clearInstagramToken(instagramUserId: string): Promise<void> {
  await db
    .update(users)
    .set({ igTokenEncrypted: null, igTokenExpiresAt: null, instagramSyncedAt: null })
    .where(eq(users.instagramUserId, instagramUserId));
}
