// Webhook payloads are stored as received (SPEC 15), but nothing personal is
// kept: PAN, KYC, phone, legal info and the payer's email, contact, VPA, card, bank and wallet are dropped and bank account numbers are
// reduced to their last 4 digits. The product status events normally carry
// none of these; this is the safety net if Razorpay adds them.
const DROPPED_KEYS = new Set([
  'pan',
  'legal_info',
  'kyc',
  'phone',
  // Payment entities (SPEC 20): the payer's details never reach our database.
  'email',
  'contact',
  'vpa',
  'card',
  'bank',
  'wallet',
  'upi',
  'acquirer_data',
  'customer_id',
  'card_id',
]);
const LAST4_KEYS = new Set(['account_number']);

export function redactWebhookPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactWebhookPayload);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (DROPPED_KEYS.has(key)) continue;
      if (LAST4_KEYS.has(key) && (typeof val === 'string' || typeof val === 'number')) {
        out[key] = `****${String(val).slice(-4)}`;
        continue;
      }
      out[key] = redactWebhookPayload(val);
    }
    return out;
  }
  return value;
}
