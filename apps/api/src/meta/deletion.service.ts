import { eq } from 'drizzle-orm';
import { withTransaction } from '../db/client.js';
import { emailLoginCodes, emailVerificationTokens, sessions, users } from '../db/schema/index.js';

/**
 * SPEC 15: soft delete and anonymize; deals, payments and invoices are kept
 * (legal record) and simply keep pointing at this now-anonymized row.
 */
export async function softDeleteAndAnonymizeUser(userId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const [existing] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await tx
      .update(users)
      .set({
        deletedAt: new Date(),
        username: `deleted_${userId.slice(0, 8)}`,
        name: 'Deleted user',
        email: null,
        emailVerifiedAt: null,
        instagramUserId: null,
        igAccountType: null,
        igTokenEncrypted: null,
        igTokenExpiresAt: null,
        bio: null,
        profilePictureUrl: null,
        followersCount: null,
        followsCount: null,
        mediaCount: null,
        engagementRate: null,
      })
      .where(eq(users.id, userId));

    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
    if (existing?.email) {
      await tx.delete(emailLoginCodes).where(eq(emailLoginCodes.email, existing.email));
    }
  });
}
