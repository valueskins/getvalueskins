import { databaseUrlProblems } from '../db/databaseUrl.js';
import type { Env } from './schema.js';

export class StartupGuardError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Startup guard failed:\n${violations.map((v) => `  - ${v}`).join('\n')}`);
    this.name = 'StartupGuardError';
    this.violations = violations;
  }
}

/**
 * Pure: never touches process.exit. Each check corresponds to a rule that
 * must never be broken (CLAUDE.md rule 4, 8; SPEC 6.2, 19).
 */
export function getStartupGuardViolations(env: Env): string[] {
  const violations: string[] = [];

  if (env.NODE_ENV === 'production' && env.ENABLE_DEV_LOGIN) {
    violations.push('ENABLE_DEV_LOGIN must not be true when NODE_ENV=production');
  }

  // Razorpay's own docs use the rzp_test_/rzp_live_ key id prefix convention;
  // only the key id (not the secret) carries this documented prefix.
  // The keys are optional while payments are off, so the prefix is checked only when a key is set.
  const expectedPrefix = env.NODE_ENV === 'production' ? 'rzp_live_' : 'rzp_test_';
  if (env.RAZORPAY_KEY_ID !== '' && !env.RAZORPAY_KEY_ID.startsWith(expectedPrefix)) {
    violations.push(
      `RAZORPAY_KEY_ID must start with "${expectedPrefix}" when NODE_ENV=${env.NODE_ENV}`,
    );
  }

  // Opening payments in production needs everything to take a real payment and issue its invoice.
  // A key that is set must also be a live key: the prefix check above covers that.
  if (env.NODE_ENV === 'production' && env.PAYMENTS_MODE !== 'off') {
    const required: Array<[string, string]> = [
      ['RAZORPAY_KEY_ID', env.RAZORPAY_KEY_ID],
      ['RAZORPAY_KEY_SECRET', env.RAZORPAY_KEY_SECRET],
      ['RAZORPAY_WEBHOOK_SECRET', env.RAZORPAY_WEBHOOK_SECRET],
      ['COMPANY_GSTIN', env.COMPANY_GSTIN],
    ];
    for (const [name, value] of required) {
      if (value.trim() === '') {
        violations.push(`${name} is required when PAYMENTS_MODE is not "off" in production`);
      }
    }
  }

  if (env.GST_RATE_BPS > 0 && env.COMPANY_GSTIN.trim() === '') {
    violations.push('COMPANY_GSTIN is required when GST_RATE_BPS is above 0');
  }

  // The console transport logs full email bodies (including sign-in codes and
  // verification links) at debug level — never acceptable in production (SPEC 20).
  if (env.NODE_ENV === 'production' && env.EMAIL_TRANSPORT === 'console') {
    violations.push('EMAIL_TRANSPORT must not be "console" when NODE_ENV=production');
  }

  // Production sign-in is Instagram only (REPLACEMENT_PLAN 2.3, CLAUDE.md 5).
  if (env.NODE_ENV === 'production' && env.AUTH_EMAIL_ENABLED) {
    violations.push('AUTH_EMAIL_ENABLED must not be true when NODE_ENV=production');
  }

  // The database is reached over TLS in production, and never through a pooler: advisory locks
  // (the scheduled jobs) need a direct connection.
  violations.push(
    ...databaseUrlProblems(env.DATABASE_URL, { requireTls: env.NODE_ENV === 'production' }),
  );

  // The free hosting tier sleeps (the API after 15 minutes idle, so no scheduled job or reminder
  // runs while it does), so nothing that takes money or posts deals may open on it.
  if (env.NODE_ENV === 'production' && env.HOSTING_TIER !== 'paid') {
    for (const name of ['PAYMENTS_MODE', 'DEAL_POSTING_MODE'] as const) {
      if (env[name] !== 'off') {
        violations.push(
          `${name} must be "off" when HOSTING_TIER is not "paid" in production: the free tier sleeps and cannot run payments or reminders`,
        );
      }
    }
  }

  return violations;
}
