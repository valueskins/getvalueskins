import type { MePayoutAccountInput, MePayoutAccountResponse } from '@valueskins/shared';
import { eq } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/types.js';
import { db, pool } from '../db/client.js';
import { creatorPayoutAccounts } from '../db/schema/index.js';
import type { Env } from '../env/index.js';
import { AppError } from '../errors/AppError.js';
import { type RazorpayClient } from '../razorpay/client.js';
import { RazorpayApiError } from '../razorpay/errors.js';
import { ROUTE_PROFILE, ROUTE_REGISTERED_ADDRESS } from './razorpayProfile.js';
import { applyPayoutStatus, mapActivationStatus, sanitizeRequirements } from './status.js';

type PayoutRow = typeof creatorPayoutAccounts.$inferSelect;

export function toPayoutResponse(row: PayoutRow | undefined): MePayoutAccountResponse {
  if (!row) return { payoutAccount: null };
  const items = (row.requirements as { items?: unknown } | null)?.items;

  return {
    payoutAccount: {
      status: row.status,
      setupComplete: row.bankLast4 !== null,
      bankLast4: row.bankLast4,
      ifsc: row.ifsc,
      requirements: Array.isArray(items) ? (items as never) : [],
    },
  };
}

async function findRow(userId: string): Promise<PayoutRow | undefined> {
  const [row] = await db
    .select()
    .from(creatorPayoutAccounts)
    .where(eq(creatorPayoutAccounts.userId, userId))
    .limit(1);
  return row;
}

export async function getPayoutAccount(userId: string): Promise<MePayoutAccountResponse> {
  return toPayoutResponse(await findRow(userId));
}

/** Razorpay rejected the request: tell the creator to check their details. */
function mapRazorpayError(error: unknown): unknown {
  if (!(error instanceof RazorpayApiError)) return error;
  if (error.isRejection) {
    return new AppError(
      'PAYOUT_ACCOUNT_REJECTED',
      422,
      'Razorpay could not accept these details. Check them and try again.',
      error.field ? { field: error.field } : undefined,
    );
  }
  return new AppError(
    'RAZORPAY_UNAVAILABLE',
    502,
    'Payout setup is temporarily unavailable. Try again in a few minutes.',
  );
}

/** One setup at a time per user, so two clicks cannot create two linked accounts. */
async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const key = `payout-setup:${userId}`;
  const connection = await pool.connect();
  try {
    const { rows } = await connection.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(hashtextextended($1, 0)) as locked',
      [key],
    );
    if (!rows[0]?.locked) {
      throw new AppError(
        'PAYOUT_SETUP_IN_PROGRESS',
        409,
        'A payout setup is already running. Wait a moment and check again.',
      );
    }
    try {
      return await fn();
    } finally {
      await connection.query('select pg_advisory_unlock(hashtextextended($1, 0))', [key]);
    }
  } finally {
    connection.release();
  }
}

const EXISTING_ACCOUNT_PATTERN = /Merchant email already exists for account - (acc_[A-Za-z0-9]+)/;

/**
 * Creates the linked account, or adopts one a previous attempt created whose
 * response was lost: Razorpay answers a repeat with "Merchant email already
 * exists for account - acc_...", and we only adopt it after the account's
 * notes.user_id proves it is ours.
 */
async function createOrAdoptAccount(
  razorpay: RazorpayClient,
  user: AuthenticatedUser & { email: string },
  input: MePayoutAccountInput,
): Promise<string> {
  try {
    const account = await razorpay.createLinkedAccount({
      email: user.email,
      phone: input.phone,
      legal_business_name: input.legalName,
      business_type: 'individual',
      contact_name: input.legalName,
      profile: {
        category: ROUTE_PROFILE.category,
        subcategory: ROUTE_PROFILE.subcategory,
        addresses: { registered: { ...ROUTE_REGISTERED_ADDRESS } },
      },
      notes: { user_id: user.id },
    });
    return account.id;
  } catch (error) {
    if (error instanceof RazorpayApiError && error.status === 400) {
      const existingId = error.description?.match(EXISTING_ACCOUNT_PATTERN)?.[1];
      if (existingId) {
        const existing = await razorpay.fetchLinkedAccount(existingId);
        const notes = existing.notes as { user_id?: unknown } | unknown[] | undefined;
        if (notes && !Array.isArray(notes) && notes.user_id === user.id) return existing.id;
        throw new AppError(
          'PAYOUT_ACCOUNT_REJECTED',
          422,
          'Razorpay could not accept these details. Check them and try again.',
          { field: 'email' },
        );
      }
    }
    throw error;
  }
}

export interface PayoutSetupDeps {
  env: Env;
  razorpay: RazorpayClient;
}

/**
 * SPEC 7.2: the full Route sequence (linked account, stakeholder, product,
 * settlement details). Progress is saved after every step, so a retry after a
 * partial failure resumes where it stopped and never creates duplicates. Only
 * the allowed fields are stored: Razorpay ids, status, bank last 4, IFSC,
 * requirement reasons and the consent time. PAN, the account number and the
 * phone go to Razorpay and nowhere else.
 */
export async function createOrResumePayoutAccount(
  deps: PayoutSetupDeps,
  user: AuthenticatedUser,
  input: MePayoutAccountInput,
): Promise<MePayoutAccountResponse> {
  if (!user.email || !user.emailVerifiedAt) {
    throw new AppError('EMAIL_NOT_VERIFIED', 409, 'Verify your email before setting up payouts.');
  }
  const verifiedUser = { ...user, email: user.email };

  return withUserLock(user.id, async () => {
    let row = await findRow(user.id);

    if (row && row.bankLast4 !== null && row.status !== 'NEEDS_CLARIFICATION') {
      throw new AppError(
        'PAYOUT_ACCOUNT_EXISTS',
        409,
        'A payout account is already set up. Use Refresh status to check it.',
      );
    }

    try {
      if (!row) {
        const accountId = await createOrAdoptAccount(deps.razorpay, verifiedUser, input);
        [row] = await db
          .insert(creatorPayoutAccounts)
          .values({
            userId: user.id,
            razorpayAccountId: accountId,
            status: 'PENDING',
            consentAt: new Date(),
          })
          .returning();
      }
      if (!row) throw new Error('payout account row was not created');

      if (!row.razorpayStakeholderId) {
        const stakeholder = await deps.razorpay.createStakeholder(row.razorpayAccountId, {
          name: input.legalName,
          email: verifiedUser.email,
          phone: { primary: input.phone },
          kyc: { pan: input.pan },
        });
        [row] = await db
          .update(creatorPayoutAccounts)
          .set({ razorpayStakeholderId: stakeholder.id })
          .where(eq(creatorPayoutAccounts.userId, user.id))
          .returning();
      }
      if (!row) throw new Error('payout account row disappeared');

      if (!row.razorpayProductId) {
        const product = await deps.razorpay.requestRouteProduct(row.razorpayAccountId);
        [row] = await db
          .update(creatorPayoutAccounts)
          .set({ razorpayProductId: product.id })
          .where(eq(creatorPayoutAccounts.userId, user.id))
          .returning();
      }
      if (!row?.razorpayProductId) throw new Error('payout account row disappeared');

      const product = await deps.razorpay.updateRouteProductSettlements(
        row.razorpayAccountId,
        row.razorpayProductId,
        {
          settlements: {
            account_number: input.bankAccountNumber,
            ifsc_code: input.ifsc,
            beneficiary_name: input.accountHolderName,
          },
          tnc_accepted: true,
        },
      );

      await db
        .update(creatorPayoutAccounts)
        .set({ bankLast4: input.bankAccountNumber.slice(-4), ifsc: input.ifsc })
        .where(eq(creatorPayoutAccounts.userId, user.id));

      await applyPayoutStatus(deps.env, {
        razorpayAccountId: row.razorpayAccountId,
        status: mapActivationStatus(product.activation_status),
        requirements: sanitizeRequirements(product.requirements),
        observedAt: new Date(),
      });
    } catch (error) {
      throw mapRazorpayError(error);
    }

    return getPayoutAccount(user.id);
  });
}

/** SPEC 7.2 "Refresh status": fetch the product configuration from Razorpay. */
export async function refreshPayoutAccount(
  deps: PayoutSetupDeps,
  user: AuthenticatedUser,
): Promise<MePayoutAccountResponse> {
  const row = await findRow(user.id);
  if (!row || !row.razorpayProductId) {
    throw new AppError(
      'SETUP_INCOMPLETE',
      409,
      'Payout setup is not finished. Submit the payout form first.',
    );
  }

  try {
    const product = await deps.razorpay.fetchRouteProduct(
      row.razorpayAccountId,
      row.razorpayProductId,
    );
    await applyPayoutStatus(deps.env, {
      razorpayAccountId: row.razorpayAccountId,
      status: mapActivationStatus(product.activation_status),
      requirements: sanitizeRequirements(product.requirements),
      observedAt: new Date(),
    });
  } catch (error) {
    throw mapRazorpayError(error);
  }

  return getPayoutAccount(user.id);
}
