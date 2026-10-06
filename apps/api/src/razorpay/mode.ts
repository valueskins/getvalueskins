export type RazorpayMode = 'test' | 'live';

/** SPEC 7.1: the key id prefix tells test mode from live mode. */
export function razorpayModeFromKeyId(keyId: string): RazorpayMode {
  if (keyId.startsWith('rzp_live_')) return 'live';
  if (keyId.startsWith('rzp_test_')) return 'test';
  throw new Error('RAZORPAY_KEY_ID must start with rzp_test_ or rzp_live_');
}
