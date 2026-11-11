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

  describe('launch gates (SPEC 19)', () => {
    const production = {
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'false',
      EMAIL_TRANSPORT: 'resend',
    } as const;
    const noRazorpay = {
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
    };
    const live = {
      RAZORPAY_KEY_ID: 'rzp_live_x',
      RAZORPAY_KEY_SECRET: 'secret',
      RAZORPAY_WEBHOOK_SECRET: 'whsec',
      COMPANY_GSTIN: '29ABCDE1234F1Z5',
    };

    describe('defaults', () => {
      it('production: both modes are off', () => {
        const env = buildTestEnv(production);
        expect([env.PAYMENTS_MODE, env.DEAL_POSTING_MODE]).toEqual(['off', 'off']);
      });

      it.each(['staging', 'development', 'test'] as const)('%s: both modes are on', (nodeEnv) => {
        const raw = buildRawTestEnv({ NODE_ENV: nodeEnv });
        delete raw.PAYMENTS_MODE;
        delete raw.DEAL_POSTING_MODE;
        const env = parseEnv(raw);
        expect([env.PAYMENTS_MODE, env.DEAL_POSTING_MODE]).toEqual(['on', 'on']);
      });

      it('a blank value counts as unset', () => {
        const env = buildTestEnv({ ...production, PAYMENTS_MODE: '', DEAL_POSTING_MODE: '  ' });
        expect([env.PAYMENTS_MODE, env.DEAL_POSTING_MODE]).toEqual(['off', 'off']);
      });

      it('an explicit value wins in every environment', () => {
        const env = buildTestEnv({
          ...production,
          ...live,
          PAYMENTS_MODE: 'admins',
          DEAL_POSTING_MODE: 'on',
        });
        expect([env.PAYMENTS_MODE, env.DEAL_POSTING_MODE]).toEqual(['admins', 'on']);
      });

      it.each(['ON', 'yes', 'true', 'closed'])('rejects "%s"', (value) => {
        expect(() => buildTestEnv({ PAYMENTS_MODE: value })).toThrow();
        expect(() => buildTestEnv({ DEAL_POSTING_MODE: value })).toThrow();
      });
    });

    describe('payments off', () => {
      it('production starts with no Razorpay variables and no GSTIN', () => {
        const env = buildTestEnv({ ...production, ...noRazorpay, PAYMENTS_MODE: 'off' });
        expect(getStartupGuardViolations(env)).toEqual([]);
      });

      it('production starts with no Razorpay variables when the mode is left at its default', () => {
        const env = buildTestEnv({ ...production, ...noRazorpay });
        expect(getStartupGuardViolations(env)).toEqual([]);
      });

      it('the key mode guard still applies when a key is set: a test key is refused in production', () => {
        const env = buildTestEnv({ ...production, ...noRazorpay, RAZORPAY_KEY_ID: 'rzp_test_x' });
        expect(getStartupGuardViolations(env)).toEqual([
          'RAZORPAY_KEY_ID must start with "rzp_live_" when NODE_ENV=production',
        ]);
      });

      it('a live key is refused outside production', () => {
        const env = buildTestEnv({ RAZORPAY_KEY_ID: 'rzp_live_x' });
        expect(getStartupGuardViolations(env)).toEqual([
          'RAZORPAY_KEY_ID must start with "rzp_test_" when NODE_ENV=test',
        ]);
      });

      it.each(['staging', 'development', 'test'] as const)(
        '%s starts with no Razorpay variables when payments are off',
        (nodeEnv) => {
          const env = buildTestEnv({ NODE_ENV: nodeEnv, PAYMENTS_MODE: 'off', ...noRazorpay });
          expect(getStartupGuardViolations(env)).toEqual([]);
        },
      );
    });

    describe.each(['admins', 'on'] as const)('production with PAYMENTS_MODE=%s', (mode) => {
      it('starts with live keys, the webhook secret and the GSTIN', () => {
        const env = buildTestEnv({ ...production, ...live, PAYMENTS_MODE: mode });
        expect(getStartupGuardViolations(env)).toEqual([]);
      });

      it('names every missing item', () => {
        const env = buildTestEnv({
          ...production,
          ...noRazorpay,
          GST_RATE_BPS: '0',
          PAYMENTS_MODE: mode,
        });
        expect(getStartupGuardViolations(env)).toEqual([
          'RAZORPAY_KEY_ID is required when PAYMENTS_MODE is not "off" in production',
          'RAZORPAY_KEY_SECRET is required when PAYMENTS_MODE is not "off" in production',
          'RAZORPAY_WEBHOOK_SECRET is required when PAYMENTS_MODE is not "off" in production',
          'COMPANY_GSTIN is required when PAYMENTS_MODE is not "off" in production',
        ]);
      });

      it.each(['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'COMPANY_GSTIN'] as const)(
        'refuses a missing %s',
        (name) => {
          const env = buildTestEnv({ ...production, ...live, PAYMENTS_MODE: mode, [name]: '' });
          expect(getStartupGuardViolations(env)).toEqual(
            expect.arrayContaining([
              `${name} is required when PAYMENTS_MODE is not "off" in production`,
            ]),
          );
        },
      );

      it('refuses a test key id', () => {
        const env = buildTestEnv({
          ...production,
          ...live,
          RAZORPAY_KEY_ID: 'rzp_test_x',
          PAYMENTS_MODE: mode,
        });
        expect(getStartupGuardViolations(env)).toEqual([
          'RAZORPAY_KEY_ID must start with "rzp_live_" when NODE_ENV=production',
        ]);
      });
    });

    it('does not require Razorpay variables for DEAL_POSTING_MODE alone', () => {
      const env = buildTestEnv({ ...production, ...noRazorpay, DEAL_POSTING_MODE: 'on' });
      expect(getStartupGuardViolations(env)).toEqual([]);
    });
  });

  describe('both launch gates on, on free hosting (decision of 11 November 2026)', () => {
    const production = {
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'false',
      EMAIL_TRANSPORT: 'resend',
    } as const;
    const live = {
      RAZORPAY_KEY_ID: 'rzp_live_x',
      RAZORPAY_KEY_SECRET: 'secret',
      RAZORPAY_WEBHOOK_SECRET: 'whsec',
      COMPANY_GSTIN: '29ABCDE1234F1Z5',
    };

    it('starts in production with both modes "on" and the live payment values', () => {
      const env = buildTestEnv({
        ...production,
        ...live,
        PAYMENTS_MODE: 'on',
        DEAL_POSTING_MODE: 'on',
      });
      expect(getStartupGuardViolations(env)).toEqual([]);
    });

    it('still refuses PAYMENTS_MODE="on" in production without the live payment values', () => {
      const env = buildTestEnv({
        ...production,
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
        RAZORPAY_WEBHOOK_SECRET: '',
        PAYMENTS_MODE: 'on',
      });
      expect(getStartupGuardViolations(env)).toEqual(
        expect.arrayContaining([
          'RAZORPAY_KEY_ID is required when PAYMENTS_MODE is not "off" in production',
        ]),
      );
    });
  });

  describe('the database connection string (Neon)', () => {
    const production = {
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'false',
      EMAIL_TRANSPORT: 'resend',
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
    } as const;
    const direct =
      'postgresql://owner:pw@ep-cool-123456.ap-southeast-1.aws.neon.tech/valueskins?sslmode=require';
    const pooled =
      'postgresql://owner:pw@ep-cool-123456-pooler.ap-southeast-1.aws.neon.tech/valueskins?sslmode=require';

    it('accepts the direct string with TLS in production', () => {
      expect(
        getStartupGuardViolations(buildTestEnv({ ...production, DATABASE_URL: direct })),
      ).toEqual([]);
    });

    it('refuses a pooled host in production, saying to use the direct string', () => {
      expect(
        getStartupGuardViolations(buildTestEnv({ ...production, DATABASE_URL: pooled })),
      ).toEqual([
        'DATABASE_URL points at a pooled host (its name contains "-pooler"). Use the direct connection string: advisory locks need it',
      ]);
    });

    it.each(['staging', 'development', 'test'] as const)(
      'refuses a pooled host in %s too',
      (nodeEnv) => {
        const violations = getStartupGuardViolations(
          buildTestEnv({ NODE_ENV: nodeEnv, DATABASE_URL: pooled }),
        );
        expect(violations).toHaveLength(1);
        expect(violations[0]).toContain('-pooler');
      },
    );

    it('requires TLS in production', () => {
      const env = buildTestEnv({
        ...production,
        DATABASE_URL:
          'postgresql://owner:pw@ep-cool-123456.ap-southeast-1.aws.neon.tech/valueskins',
      });
      expect(getStartupGuardViolations(env)).toEqual([
        'DATABASE_URL must include sslmode=require (TLS is required)',
      ]);
    });

    it('does not require TLS outside production (a local database)', () => {
      const env = buildTestEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      });
      expect(getStartupGuardViolations(env)).toEqual([]);
    });

    it('never repeats the connection string in a message', () => {
      const text = getStartupGuardViolations(
        buildTestEnv({ ...production, DATABASE_URL: pooled.replace('?sslmode=require', '') }),
      ).join(' ');
      expect(text).not.toContain('owner');
      expect(text).not.toContain(':pw@');
    });
  });
});
