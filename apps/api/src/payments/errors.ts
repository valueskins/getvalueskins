import { AppError } from '../errors/AppError.js';
import { RazorpayApiError } from '../razorpay/errors.js';

/** A Razorpay failure while handling a payment, as an AppError with a generic message. */
export function mapRazorpayError(error: unknown): unknown {
  if (!(error instanceof RazorpayApiError)) return error;
  if (error.isRejection) {
    return new AppError('PAYMENT_REJECTED', 422, 'Razorpay could not accept this payment request');
  }
  return new AppError(
    'RAZORPAY_UNAVAILABLE',
    502,
    'Razorpay is not reachable right now. Try again.',
  );
}
