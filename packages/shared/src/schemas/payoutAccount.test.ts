import { describe, expect, it } from 'vitest';
import { mePayoutAccountSchema, normalizeIndianMobile } from './payoutAccount.js';

describe('mePayoutAccountSchema', () => {
  const base = {
    legalName: 'Jane Doe',
    pan: 'ABCPE1234F',
    bankAccountNumber: '123456789012',
    ifsc: 'HDFC0001234',
    accountHolderName: 'Jane Doe',
    phone: '9876543210',
    consent: true as const,
  };

  it('accepts a fully valid payout form', () => {
    expect(mePayoutAccountSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an invalid PAN', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, pan: 'invalid' }).success).toBe(false);
  });

  it('requires the 4th PAN character to be P (individual)', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, pan: 'ABCDE1234F' }).success).toBe(false);
    expect(mePayoutAccountSchema.safeParse({ ...base, pan: 'ABCPE1234F' }).success).toBe(true);
  });

  it('rejects an invalid IFSC', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, ifsc: 'invalid' }).success).toBe(false);
  });

  it('rejects consent that is not exactly true', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });

  it('rejects a legal name shorter than Razorpay minimum of 4', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, legalName: 'Raj' }).success).toBe(false);
  });

  it('only accepts 5 to 20 digit bank account numbers', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, bankAccountNumber: '1234' }).success).toBe(
      false,
    );
    expect(
      mePayoutAccountSchema.safeParse({ ...base, bankAccountNumber: '12ab5678' }).success,
    ).toBe(false);
    expect(
      mePayoutAccountSchema.safeParse({ ...base, bankAccountNumber: '1'.repeat(21) }).success,
    ).toBe(false);
  });

  it('requires a phone number (Razorpay requires one) and normalizes it to 10 digits', () => {
    expect(mePayoutAccountSchema.safeParse({ ...base, phone: undefined }).success).toBe(false);

    const parsed = mePayoutAccountSchema.safeParse({ ...base, phone: '+91 98765-43210' });
    expect(parsed.success && parsed.data.phone).toBe('9876543210');
    expect(mePayoutAccountSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
    expect(mePayoutAccountSchema.safeParse({ ...base, phone: '5876543210' }).success).toBe(false);
  });
});

describe('normalizeIndianMobile', () => {
  it('strips country code, leading zero and separators', () => {
    expect(normalizeIndianMobile('+919876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('919876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('(98765) 43210')).toBe('9876543210');
  });
});
