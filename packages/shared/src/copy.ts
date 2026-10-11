import { formatInr } from './money.js';

// Homepage (SPEC 18)
export const HOMEPAGE_TAGLINE = 'ValueSkins - Where creators and brands connect to collaborate.';
export const HOMEPAGE_BRAND_PITCH = 'Brands: Post a deal. Select a creator. Pay. Done.';
export const HOMEPAGE_CREATOR_PITCH = 'Creators: Browse deals. Apply. Deliver. Get paid.';
export const CONTINUE_WITH_INSTAGRAM = 'Continue with Instagram';
export const SIGN_IN_WITH_EMAIL = 'Sign in with email';

// Disabled-button reasons (SPEC 18)
export const APPLICATIONS_CLOSED = 'Applications closed';
export const ADD_UPI_TO_APPLY = 'Add your UPI ID to apply';
export const CANCELLATION_NOT_POSSIBLE_AFTER_ADVANCE =
  'Cancellation is not possible after the advance is paid';

export const ALREADY_APPLIED_MESSAGE = 'You have already applied';
export const NO_APPLICATIONS_YET = 'No applications yet';
export const CREATOR_HAS_NO_UPI = 'The creator has not added a UPI ID yet';
export const WAITING_FOR_CREATOR_TO_CONFIRM =
  'Waiting for the creator to confirm the payment you recorded';
export const NO_PAYMENT_RECORDED_YET = 'The brand has not recorded a payment yet';
export const UPLOAD_LIMIT_REACHED = 'The limit of 20 content links for this deal has been reached';
export const ADD_BILLING_TO_PUBLISH = 'Add billing details to publish';

// Disputes and admin actions (SPEC 12)
export const DISPUTE_NOT_ALLOWED =
  'A dispute can be raised once a creator has been confirmed for the deal';
export const DISPUTE_ALREADY_RESOLVED = 'This dispute is already resolved';

// Revision limit notice (SPEC 5.5)
export const FIVE_REVISIONS_WARNING =
  'This deal has had 5 revisions. If you cannot agree, raise a dispute.';

// Instagram login (SPEC 6.1)
export const INSTAGRAM_PROFESSIONAL_ACCOUNT_REQUIRED =
  'ValueSkins needs an Instagram Professional account. You can switch for free in Instagram settings: Account type and tools, Switch to professional account.';

// Onboarding (SPEC 6.4)
export const ROLE_CANNOT_CHANGE_WARNING = 'You cannot change this later.';

// Creator payout details (SPEC 7.2, REPLACEMENT_PLAN 2.1)
export const PAYOUT_CONSENT_TEXT =
  'I agree my UPI ID and name are shown to a brand that confirms me on a deal.';
export const UPI_NOT_VERIFIED_WARNING =
  'We do not verify UPI IDs. Enter yours carefully. A payment to a wrong UPI ID cannot be recalled.';
export const CREATOR_PAYOUT_NOT_SET =
  'This creator has not added a UPI ID, so the deal cannot be confirmed with them';

// Direct payments (REPLACEMENT_PLAN 2.1)
export const PAYMENT_RECORD_DISCLAIMER =
  'Paid directly by the brand to the creator by UPI. ValueSkins did not receive or hold this money.';
export const DIRECT_PAYMENT_ALREADY_RECORDED =
  'A payment is already recorded for this stage and is waiting for the creator to confirm';
export const DIRECT_PAYMENT_NOT_PENDING =
  'This payment was already confirmed or marked as not received';
export const CHECK_YOUR_UPI_APP = 'Check your UPI app and confirm if the money arrived.';

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
