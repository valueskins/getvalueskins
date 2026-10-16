import { ApiError } from './api/client';
import { errorText } from './api/errors';

/** The lost-race text (DlEdge). The API's own messages for these codes can name raw statuses. */
export const DEAL_CHANGED = 'This deal just changed. We reloaded it so you see the latest.';

export interface DealErrorText {
  title: string;
  text?: string;
  /** The page should re-read the deal: someone else acted first. */
  reload: boolean;
}

function minutes(err: ApiError): string {
  if (!err.retryAfter) return 'a while';
  const m = Math.max(1, Math.ceil(err.retryAfter / 60));
  return m >= 60
    ? `${Math.ceil(m / 60)} ${m >= 120 ? 'hours' : 'hour'}`
    : `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Plain words for a failed deal action (the DlEdge board). Validation errors
 * are shown under their fields by the forms, not here.
 */
export function dealErrorText(
  err: unknown,
  context: 'record' | 'dispute' | 'other' = 'other',
): DealErrorText {
  if (!(err instanceof ApiError)) return { title: errorText(err), reload: false };
  switch (err.code) {
    case 'WRONG_DEAL_STATUS':
      // The API says, in plain words, when this action is possible (SPEC 16).
      return {
        title: err.message,
        text: 'We reloaded the deal so you see the latest.',
        reload: true,
      };
    case 'INVALID_TRANSITION':
    case 'APPLICATION_NOT_PENDING':
    case 'DEAL_NOT_DRAFT':
      return {
        title: 'This deal just changed',
        text: 'We reloaded it so you see the latest.',
        reload: true,
      };
    case 'DIRECT_PAYMENT_NOT_PENDING':
      return {
        title: err.message,
        text: 'We reloaded the deal so you see the latest.',
        reload: true,
      };
    case 'DIRECT_PAYMENT_ALREADY_RECORDED':
      return { title: err.message, text: 'Your second entry was not saved.', reload: true };
    case 'RATE_LIMITED':
      if (context === 'dispute') {
        return {
          title: 'You can raise 3 disputes on a deal in a day',
          text: 'We already have the ones you sent. Write to us if it is urgent.',
          reload: false,
        };
      }
      return {
        title: 'Too many tries in the last hour',
        text: `Wait ${minutes(err)}, then try again. Nothing was ${context === 'record' ? 'recorded' : 'saved'}.`,
        reload: false,
      };
    case 'DOCUMENT_NOT_AVAILABLE':
      return {
        title: 'This document is not available yet',
        text: 'It is issued at the step shown next to it.',
        reload: false,
      };
    case 'RAZORPAY_UNAVAILABLE':
      return {
        title: 'Razorpay is not reachable right now. Try again.',
        text: 'Nothing was charged.',
        reload: false,
      };
    case 'PAYMENT_REJECTED':
      return {
        title: 'Razorpay could not accept this payment request.',
        text: 'Nothing was charged. Try again.',
        reload: false,
      };
    case 'INVALID_SIGNATURE':
    case 'PAYMENT_ORDER_MISMATCH':
      return {
        title: 'We could not confirm this payment',
        text: 'If money left your account, do not pay again. Write to us with the deal id.',
        reload: true,
      };
    // These messages are plain words from the API (SPEC 16), so they are shown as they are.
    case 'PAYMENT_NOT_CAPTURED':
    case 'PAYMENT_AMOUNT_MISMATCH':
    case 'FEE_CAPTURED_DEAL_CHANGED':
      return { title: err.message, reload: true };
    case 'WRONG_ROLE':
      return { title: err.message, reload: false };
    case 'NOT_FOUND':
      return { title: 'This deal is no longer available to you.', reload: true };
    default:
      return { title: errorText(err), reload: false };
  }
}
