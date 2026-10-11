import { type UserRole, roleFromAccountType } from '@valueskins/shared';
import { eq, or } from 'drizzle-orm';
import type { Tx } from '../deals/stateMachine.js';
import { applications, deals } from '../db/schema/index.js';
import { AppError } from '../errors/AppError.js';

export interface RoleSubject {
  id: string;
  role: UserRole | null;
}

/**
 * True when the account has deals as a brand, or deals or applications as a creator
 * (REPLACEMENT_PLAN 2.3). Any deal counts, a draft included.
 */
export async function hasActivityInRole(tx: Tx, userId: string, role: UserRole): Promise<boolean> {
  if (role === 'BRAND') {
    const rows = await tx
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.brandId, userId))
      .limit(1);
    return rows.length > 0;
  }
  const [asApplicant, asCreator] = await Promise.all([
    tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.creatorId, userId))
      .limit(1),
    tx
      .select({ id: deals.id })
      .from(deals)
      .where(or(eq(deals.creatorId, userId)))
      .limit(1),
  ]);
  return asApplicant.length > 0 || asCreator.length > 0;
}

export interface RoleResolution {
  role: UserRole;
  /** The account had another role before and now follows its new account type. */
  changed: boolean;
}

/**
 * The role an Instagram sign-in gives an account (REPLACEMENT_PLAN 2.3). It comes only from the
 * account type. A returning account follows a changed type only while it has no deals or
 * applications in its current role. Call it inside the transaction that holds the user's row lock,
 * so a deal cannot be created between the check and the change.
 */
export async function resolveRole(
  tx: Tx,
  existing: RoleSubject | null,
  accountType: string | null | undefined,
  supportEmail: string,
): Promise<RoleResolution> {
  const role = roleFromAccountType(accountType);
  if (role === null) {
    throw new AppError(
      'ACCOUNT_TYPE_UNSUPPORTED',
      403,
      'This Instagram account type cannot be used on ValueSkins',
    );
  }
  if (existing === null || existing.role === null || existing.role === role) {
    return { role, changed: false };
  }
  if (await hasActivityInRole(tx, existing.id, existing.role)) {
    throw new AppError(
      'ACCOUNT_TYPE_CHANGE_BLOCKED',
      409,
      `Your Instagram account type changed, but this account already has deals or applications. Write to ${supportEmail} and we will sort it out.`,
    );
  }
  return { role, changed: true };
}
