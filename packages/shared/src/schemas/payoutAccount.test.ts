import { describe, expect, it } from 'vitest';
import { mePayoutAccountSchema } from './payoutAccount.js';

describe('mePayoutAccountSchema', () => {
  const base = {
    legalName: 'Jane Doe',
    pan: 'ABCDE1234F',
    bankAccountNumber: '123456789012',
    ifsc: 'HDFC0001234',
    accountHolderName: 'Jane Doe',
    consent: true as const,
  };

  it('accepts a fully valid payout form', () => {
    expect(mePayoutAccountSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an invalid PAN', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, pan: 'invalid' }).success).toBe(false);
  });

  it('rejects an invalid IFSC', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, ifsc: 'invalid' }).success).toBe(false);
  });

  it('rejects consent that is not exactly true', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });
});
