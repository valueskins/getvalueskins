import { formatInr } from './money.js';

// Homepage (SPEC 18)
export const HOMEPAGE_TAGLINE = 'ValueSkins - Where creators and brands connect to collaborate.';
export const HOMEPAGE_BRAND_PITCH = 'Brands: Post a deal. Select a creator. Pay. Done.';
export const HOMEPAGE_CREATOR_PITCH = 'Creators: Browse deals. Apply. Deliver. Get paid.';
export const CONTINUE_WITH_INSTAGRAM = 'Continue with Instagram';
export const SIGN_IN_WITH_EMAIL = 'Sign in with email';

// Disabled-button reasons (SPEC 18)
export const APPLICATIONS_CLOSED = 'Applications closed';
export const SET_UP_PAYOUTS_TO_APPLY = 'Set up payouts to apply';
export const CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE =
  'Cancellation is not possible after the advance is paid';

export const ALREADY_APPLIED_MESSAGE = 'You have already applied';
export const NO_APPLICATIONS_YET = 'No applications yet';
export const ADD_BILLING_TO_PUBLISH = 'Add billing details to publish';

// Revision limit notice (SPEC 5.5)
export const FIVE_REVISIONS_WARNING =
  'This deal has had 5 revisions. If you cannot agree, raise a dispute.';

// Instagram login (SPEC 6.1)
export const INSTAGRAM_PROFESSIONAL_ACCOUNT_REQUIRED =
  'ValueSkins needs an Instagram Professional account. You can switch for free in Instagram settings: Account type and tools, Switch to professional account.';

// Onboarding (SPEC 6.4)
export const ROLE_CANNOT_CHANGE_WARNING = 'You cannot change this later.';

// Payout consent (SPEC 7.2)
export const PAYOUT_CONSENT_TEXT =
  'I agree that Razorpay will store my bank and KYC details to pay me.';

// Settlement timing (SPEC 8) — reused across advance/final/payout-status emails.
export const SETTLEMENT_TIMING_NOTE =
  'Razorpay will send this to your bank account on its settlement schedule.';

// Payment CTAs (SPEC 5.5) — the amount varies per deal, so these are functions, not fixed strings.
export function payCommissionLabel(commissionTotalPaise: number): string {
  return `Pay commission: ${formatInr(commissionTotalPaise)}`;
}

export function payAdvanceLabel(advancePaise: number): string {
  return `Pay advance: ${formatInr(advancePaise)}`;
}

export function payFinalLabel(finalPaise: number): string {
  return `Pay final: ${formatInr(finalPaise)}`;
}
