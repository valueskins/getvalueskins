import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Standard Checkout signature (SPEC 7.3): HMAC-SHA256 of `order_id|payment_id`
 * with the key secret, hex. Compared in constant time.
 */
export function verifyPaymentSignature(
  keySecret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest();
  const given = Buffer.from(signature, 'hex');
  // A non-hex or wrong-length signature decodes to a different length: reject before comparing.
  return given.length === expected.length && timingSafeEqual(given, expected);
}
