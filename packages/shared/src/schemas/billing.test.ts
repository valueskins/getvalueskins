import { describe, expect, it } from 'vitest';
import { meBillingSchema } from './billing.js';

describe('meBillingSchema', () => {
  const base = {
    billingName: 'Acme Pvt Ltd',
    billingAddress: '123 MG Road',
    billingState: 'Karnataka',
  };

  it('accepts billing details without a GSTIN', () => {
    expect(meBillingSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a valid GSTIN', () => {
    expect(meBillingSchema.safeParse({ ...base, gstin: '29ABCDE1234F1Z5' }).success).toBe(true);
  });

  it('rejects an invalid GSTIN', () => {
    expect(meBillingSchema.safeParse({ ...base, gstin: 'not-a-gstin' }).success).toBe(false);
  });
});
