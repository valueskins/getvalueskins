import { describe, expect, it } from 'vitest';
import { meBillingResponseSchema, meBillingSchema } from './billing.js';

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

describe('meBillingResponseSchema', () => {
  it('accepts saved details and null', () => {
    expect(meBillingResponseSchema.safeParse({ billing: null }).success).toBe(true);
    expect(
      meBillingResponseSchema.safeParse({
        billing: { billingName: 'A', billingAddress: 'B', billingState: 'C', gstin: null },
      }).success,
    ).toBe(true);
  });

  it('needs the key and a gstin that is a string or null', () => {
    expect(meBillingResponseSchema.safeParse({}).success).toBe(false);
    expect(
      meBillingResponseSchema.safeParse({
        billing: { billingName: 'A', billingAddress: 'B', billingState: 'C' },
      }).success,
    ).toBe(false);
  });
});
