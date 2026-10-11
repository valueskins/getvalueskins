import { type OnboardingState, computeOnboarding } from '@valueskins/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { brandBilling, users } from '../db/schema/index.js';

/** The onboarding state for a user, read from the database. */
export async function loadOnboardingState(userId: string): Promise<OnboardingState> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('loadOnboardingState: user not found');

  const [billing] = await db
    .select({ userId: brandBilling.userId })
    .from(brandBilling)
    .where(eq(brandBilling.userId, userId))
    .limit(1);

  return computeOnboarding({
    hasInstagram: user.instagramUserId !== null,
    role: user.role,
    emailVerified: user.email !== null && user.emailVerifiedAt !== null,
    hasBilling: billing !== undefined,
    instagramUsernameSet: user.instagramUsernameSetAt !== null,
    hasPayoutDetails:
      user.payoutVpa !== null && user.payoutName !== null && user.payoutVpaConsentAt !== null,
  });
}

/**
 * Sets onboarding_completed_at the first time every required step is done
 * (SPEC 6.4, V0_LAUNCH 2.2). Set once and never unset. Returns the state.
 */
export async function completeOnboardingIfReady(userId: string): Promise<OnboardingState> {
  const state = await loadOnboardingState(userId);

  if (state.completed) {
    await db
      .update(users)
      .set({ onboardingCompletedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.onboardingCompletedAt)));
  }

  return state;
}
