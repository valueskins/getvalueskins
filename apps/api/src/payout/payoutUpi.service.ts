import { maskVpa, type MePayoutUpiInput, type PayoutUpiView } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';

/**
 * A creator's own payout details (REPLACEMENT_PLAN 2.1). The UPI ID is returned masked, always:
 * the full ID goes only to the brand confirmed on a deal, once direct payments exist (Prompt 13).
 */
export async function getPayoutUpi(userId: string): Promise<PayoutUpiView | null> {
  const [row] = await db
    .select({
      vpa: users.payoutVpa,
      name: users.payoutName,
      consentAt: users.payoutVpaConsentAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.vpa || !row.name || !row.consentAt) return null;
  return { maskedVpa: maskVpa(row.vpa), name: row.name, consentAt: row.consentAt.toISOString() };
}

/** Saves the details and stamps the consent with `now`. Saving again replaces them. */
export async function savePayoutUpi(
  userId: string,
  input: MePayoutUpiInput,
  now: Date,
): Promise<PayoutUpiView> {
  await db
    .update(users)
    .set({ payoutVpa: input.vpa, payoutName: input.name, payoutVpaConsentAt: now })
    .where(eq(users.id, userId));
  return { maskedVpa: maskVpa(input.vpa), name: input.name, consentAt: now.toISOString() };
}
