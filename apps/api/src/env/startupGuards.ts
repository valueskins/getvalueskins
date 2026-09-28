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
 * must never be broken (CLAUDE.md rule 4, 8; SPEC 6.2, V0_LAUNCH 2.6).
 */
export function getStartupGuardViolations(env: Env): string[] {
  const violations: string[] = [];

  if (env.NODE_ENV === 'production' && env.ENABLE_DEV_LOGIN) {
    violations.push('ENABLE_DEV_LOGIN must not be true when NODE_ENV=production');
  }

  // Razorpay's own docs use the rzp_test_/rzp_live_ key id prefix convention;
  // only the key id (not the secret) carries this documented prefix.
  const expectedPrefix = env.NODE_ENV === 'production' ? 'rzp_live_' : 'rzp_test_';
  if (!env.RAZORPAY_KEY_ID.startsWith(expectedPrefix)) {
    violations.push(
      `RAZORPAY_KEY_ID must start with "${expectedPrefix}" when NODE_ENV=${env.NODE_ENV}`,
    );
  }

  if (env.GST_RATE_BPS > 0 && env.COMPANY_GSTIN.trim() === '') {
    violations.push('COMPANY_GSTIN is required when GST_RATE_BPS is above 0');
  }

  // The console transport logs full email bodies (including sign-in codes and
  // verification links) at debug level — never acceptable in production (SPEC 20).
  if (env.NODE_ENV === 'production' && env.EMAIL_TRANSPORT === 'console') {
    violations.push('EMAIL_TRANSPORT must not be "console" when NODE_ENV=production');
  }

  return violations;
}
