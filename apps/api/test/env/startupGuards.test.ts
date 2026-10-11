import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/env/parse.js';
import { getStartupGuardViolations } from '../../src/env/startupGuards.js';
import { buildRawTestEnv, buildTestEnv } from '../testEnv.js';

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

  it('flags EMAIL_TRANSPORT=console in production', () => {
    const env = buildTestEnv({
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'false',
      RAZORPAY_KEY_ID: 'rzp_live_x',
      EMAIL_TRANSPORT: 'console',
    });

    expect(getStartupGuardViolations(env).some((v) => v.includes('EMAIL_TRANSPORT'))).toBe(true);
  });

  it('allows EMAIL_TRANSPORT=console outside production', () => {
    const env = buildTestEnv({ EMAIL_TRANSPORT: 'console' });

    expect(getStartupGuardViolations(env)).toEqual([]);
  });

  it('allows EMAIL_TRANSPORT=resend in production', () => {
    const env = buildTestEnv({
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'false',
      RAZORPAY_KEY_ID: 'rzp_live_x',
      EMAIL_TRANSPORT: 'resend',
    });

    expect(getStartupGuardViolations(env)).toEqual([]);
  });

  describe('AUTH_EMAIL_ENABLED (REPLACEMENT_PLAN 2.3)', () => {
    const production = {
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'false',
      RAZORPAY_KEY_ID: 'rzp_live_x',
      EMAIL_TRANSPORT: 'resend',
    } as const;

    it('is refused in production', () => {
      const violations = getStartupGuardViolations(
        buildTestEnv({ ...production, AUTH_EMAIL_ENABLED: 'true' }),
      );

      expect(violations).toEqual(['AUTH_EMAIL_ENABLED must not be true when NODE_ENV=production']);
    });

    it('is allowed in production when it is false', () => {
      expect(
        getStartupGuardViolations(buildTestEnv({ ...production, AUTH_EMAIL_ENABLED: 'false' })),
      ).toEqual([]);
    });

    it.each(['staging', 'development', 'test'] as const)('is allowed in %s', (nodeEnv) => {
      expect(
        getStartupGuardViolations(buildTestEnv({ NODE_ENV: nodeEnv, AUTH_EMAIL_ENABLED: 'true' })),
      ).toEqual([]);
    });
  });

  describe('GST rate default (REPLACEMENT_PLAN 2.2)', () => {
    const withoutRate = () => {
      const raw = buildRawTestEnv();
      delete raw.GST_RATE_BPS;
      return raw;
    };

    it('is 18% when GST_RATE_BPS is not set, so the GSTIN is then required', () => {
      const env = parseEnv(withoutRate());

      expect(env.GST_RATE_BPS).toBe(1800);
      expect(getStartupGuardViolations(env)).toEqual([
        'COMPANY_GSTIN is required when GST_RATE_BPS is above 0',
      ]);
    });

    it('treats a blank GST_RATE_BPS as unset, not as 0', () => {
      expect(parseEnv({ ...withoutRate(), GST_RATE_BPS: '' }).GST_RATE_BPS).toBe(1800);
    });

    it('is fine with the default once the GSTIN is set', () => {
      const env = parseEnv({ ...withoutRate(), COMPANY_GSTIN: '29ABCDE1234F1Z5' });

      expect(getStartupGuardViolations(env)).toEqual([]);
    });

    it('still honours an explicit 0', () => {
      expect(parseEnv(buildRawTestEnv({ GST_RATE_BPS: '0' })).GST_RATE_BPS).toBe(0);
    });
  });
});
