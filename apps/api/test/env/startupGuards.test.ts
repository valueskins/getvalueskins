import { describe, expect, it } from 'vitest';
import { getStartupGuardViolations } from '../../src/env/startupGuards.js';
import { buildTestEnv } from '../testEnv.js';

describe('getStartupGuardViolations', () => {
  it('has no violations for a valid non-production env', () => {
    expect(getStartupGuardViolations(buildTestEnv())).toEqual([]);
  });

  it('flags ENABLE_DEV_LOGIN=true in production', () => {
    const env = buildTestEnv({
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'true',
      RAZORPAY_KEY_ID: 'rzp_live_x',
    });

    expect(getStartupGuardViolations(env).some((v) => v.includes('ENABLE_DEV_LOGIN'))).toBe(true);
  });

  it('flags a test-mode Razorpay key id in production', () => {
    const env = buildTestEnv({
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'false',
      RAZORPAY_KEY_ID: 'rzp_test_x',
    });

    expect(getStartupGuardViolations(env).some((v) => v.includes('RAZORPAY_KEY_ID'))).toBe(true);
  });

  it('flags a live-mode Razorpay key id outside production', () => {
    const env = buildTestEnv({ RAZORPAY_KEY_ID: 'rzp_live_x' });

    expect(getStartupGuardViolations(env).some((v) => v.includes('RAZORPAY_KEY_ID'))).toBe(true);
  });

  it('flags GST_RATE_BPS above 0 with an empty COMPANY_GSTIN', () => {
    const env = buildTestEnv({ GST_RATE_BPS: '1800', COMPANY_GSTIN: '' });

    expect(getStartupGuardViolations(env).some((v) => v.includes('COMPANY_GSTIN'))).toBe(true);
  });

  it('allows GST_RATE_BPS above 0 once COMPANY_GSTIN is set', () => {
    const env = buildTestEnv({ GST_RATE_BPS: '1800', COMPANY_GSTIN: '29ABCDE1234F1Z5' });

    expect(getStartupGuardViolations(env)).toEqual([]);
  });

  it('allows GST_RATE_BPS of 0 with an empty COMPANY_GSTIN', () => {
    const env = buildTestEnv({ GST_RATE_BPS: '0', COMPANY_GSTIN: '' });

    expect(getStartupGuardViolations(env)).toEqual([]);
  });
});
