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
export const CANCELLATION_NOT_POSSIBLE_AFTER_FEE =
  'The deal cannot be cancelled after the fee is paid. Write to us if something is wrong.';

export const ALREADY_APPLIED_MESSAGE = 'You have already applied';
export const NO_APPLICATIONS_YET = 'No applications yet';
export const CREATOR_HAS_NO_UPI = 'The creator has not added a UPI ID yet';
export const CREATOR_NOT_AGREED_TO_SHARE_UPI = 'The creator has not agreed to share their UPI ID';
export const WAITING_FOR_CREATOR_TO_CONFIRM =
  'Waiting for the creator to confirm the payment you recorded';
export const NO_PAYMENT_RECORDED_YET = 'The brand has not recorded a payment yet';
export const UPLOAD_LIMIT_REACHED = 'The limit of 20 content links for this deal has been reached';
export const ADD_BILLING_TO_PUBLISH = 'Add billing details to publish';

// Disputes and admin actions (SPEC 12)
export const DISPUTE_NOT_ALLOWED =
  'A dispute can be raised once a creator has been confirmed for the deal';
export const DISPUTE_ALREADY_RESOLVED = 'This dispute is already resolved';
export const DISPUTE_ALREADY_OPEN = 'A dispute is already open on this deal';

// Applicants (SPEC 5.5): why a brand cannot confirm an applicant yet
export const APPLICANT_HAS_NO_UPI = 'This creator has not added a UPI ID';
export const APPLICANT_NO_LONGER_AVAILABLE = 'This creator is no longer available';
export const APPLICATION_ALREADY_DECIDED = 'This application was already decided';
export const DEAL_NO_LONGER_OPEN = 'This deal is no longer open for applications';

// Errors a user can see (SPEC 16): plain, never a raw status name
export const DEAL_JUST_CHANGED = 'This deal just changed. Reload it and try again.';
export const ADMIN_CANCEL_WINDOW =
  'An admin can cancel a deal after the fee is paid and before it is completed.';
export const ADMIN_DEAL_ALREADY_CANCELLED = 'This deal is already cancelled';
export const ADMIN_NO_EMAILS_YET = 'No emails on this deal yet';

// Role and payment errors (SPEC 16): plain words, never a raw role or a provider status
export const ONLY_BRANDS_CAN = 'Only a brand account can do this.';
export const ONLY_CREATORS_CAN = 'Only a creator account can do this.';
export const PAYMENT_NOT_CONFIRMED_YET =
  'Razorpay has not confirmed this payment yet. If money left your account, do not pay again.';
export const PAYMENT_COULD_NOT_BE_CONFIRMED =
  'We could not confirm this payment. If money left your account, do not pay again. We will check it and write to you.';

// Why a deal action cannot be taken now (SPEC 16, WRONG_DEAL_STATUS): no step or status names
export const FEE_NOT_DUE = 'The ValueSkins fee is not due on this deal';
export const NOT_WAITING_FOR_THIS_PAYMENT = 'The deal is no longer waiting for this payment';
export function paymentNotDueYet(stage: 'ADVANCE' | 'FINAL'): string {
  return `The ${stage === 'ADVANCE' ? 'advance' : 'final'} payment is not due yet`;
}
export const CONTENT_CANNOT_BE_SHARED_NOW =
  'Content can be shared once the advance is confirmed, or after the brand asks for changes.';
export const FEEDBACK_NOT_POSSIBLE_NOW =
  'Changes can be asked for only while the brand is looking at shared content.';
export const APPROVAL_NOT_POSSIBLE_NOW =
  'The content can be approved only while the brand is looking at it.';

// The fee captured after the deal had changed (SPEC 7.3)
export function feeCapturedDealChangedMessage(amountPaise: number): string {
  return `Your payment of ${formatInr(amountPaise)} went through, but the deal had already changed. We will refund it.`;
}
export const FEE_CAPTURED_DEAL_CHANGED_ALERT =
  'Fee received on a deal that had changed, refund by hand';

// Publishing (SPEC 13)
export const PUBLISH_LIMIT_MESSAGE = 'You can publish up to 10 deals a day';

// Launch gates (SPEC 19): payments and deal posting open later without a deploy
export const PAYMENTS_NOT_OPEN = 'Payments open soon. We will email you when they do.';
export const POSTING_NOT_OPEN = 'Posting deals opens soon. We will email you when it does.';
export const LAUNCH_BANNER_BRAND =
  'Posting deals opens soon. You can set up your profile and billing, and save drafts.';
export const LAUNCH_BANNER_CREATOR =
  'Deals will appear here once brands start posting. Finish your profile and UPI ID so you can apply.';

// Revision limit notice (SPEC 5.5)
export const FIVE_REVISIONS_WARNING =
  'This deal has had 5 revisions. If you cannot agree, raise a dispute.';

// Instagram login (SPEC 6.1, REPLACEMENT_PLAN 2.3)
export const ACCOUNT_TYPE_UNSUPPORTED =
  'ValueSkins needs a public Instagram Business or Creator account. A Business account posts deals as a brand. A Creator account applies to deals.';
export const CONNECT_INSTAGRAM_TO_CONTINUE = 'Connect your Instagram account to continue.';

// Profile details (SPEC 6.4, REPLACEMENT_PLAN 2.4)
export const ADULT_CONFIRMATION_TEXT = 'I am 18 or older.';

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

// Payment CTAs (SPEC 5.5) - the amount varies per deal, so these are functions, not fixed strings.
/** The label for the ValueSkins fee. */
export function payFeeLabel(commissionTotalPaise: number): string {
  return `Pay ValueSkins fee: ${formatInr(commissionTotalPaise)}`;
}

export function payAdvanceLabel(advancePaise: number): string {
  return `Pay advance: ${formatInr(advancePaise)}`;
}

export function payFinalLabel(finalPaise: number): string {
  return `Pay final: ${formatInr(finalPaise)}`;
}

/**
 * The deal description template (SPEC 9): placeholder text and an "Insert template" button in the
 * create form. The examples follow the copy rules: money as ₹2,000.00 and dates as 1 to 3 Oct.
 */
export const DEAL_DESCRIPTION_TEMPLATE = [
  'Content type: [3 Instagram posts + 1 reel]',
  'Shooting: [On location required. Studio address: ...]',
  `Travel: [Travel allowance: ${formatInr(2_000_00)} / Not provided]`,
  'Timeline: [Shooting 1 to 3 Oct, posting 5 to 7 Oct, one post per day]',
  'Approval: [1 round of revisions, brand replies within 2 days]',
  'Rights: [Brand may repost for 6 months from posting date]',
  'Deliverables: [1080x1350 JPG, captions in English and Hindi]',
  'Restrictions: [No competitor brands, no explicit content]',
  'Delivery: [Upload to Google Drive and share the link on ValueSkins]',
  '',
  'Additional notes:',
].join('\n');
