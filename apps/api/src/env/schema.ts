import { GST_RATE_BPS as DEFAULT_GST_RATE_BPS, LAUNCH_MODES, type LaunchMode } from '@valueskins/shared';
import { z } from 'zod';

const requiredString = z.string().min(1);

/** 'true'/'false' string env var -> boolean. Never z.coerce.boolean() — it does
 * Boolean(str), so the literal string 'false' would coerce to true. */
const booleanFlag = z.enum(['true', 'false']).transform((v) => v === 'true');

/**
 * off | admins | on. Blank counts as unset. The default depends on NODE_ENV, so parseEnv fills it
 * in: `off` in production, `on` everywhere else (SPEC 19).
 */
const launchMode = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.enum(LAUNCH_MODES).optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: requiredString,
  // Test-only tooling (never required in production); db/client.ts already
  // throws its own clear error if this is missing when actually needed.
  // Defaults to '' so a host that cannot define empty env vars (Render) can omit it.
  TEST_DATABASE_URL: z.string().default(''),
  WEB_ORIGIN: z.string().url(),
  // Empty on localhost (SPEC 19: "cookie without Domain").
  COOKIE_DOMAIN: z.string(),
  SESSION_COOKIE_NAME: requiredString,
  SESSION_SECRET: requiredString,
  TOKEN_ENCRYPTION_KEY: requiredString,
  INSTAGRAM_APP_ID: requiredString,
  INSTAGRAM_APP_SECRET: requiredString,
  INSTAGRAM_REDIRECT_URI: z.string().url(),
  META_APP_SECRET: requiredString,
  // Optional while PAYMENTS_MODE=off. A startup guard requires all three live values in production
  // when payments are not off, and the key prefix must match the environment whenever a key is set.
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
  RESEND_API_KEY: requiredString,
  EMAIL_FROM: requiredString,
  EMAIL_TRANSPORT: z.enum(['console', 'resend']),
  // Comma-separated, can be empty (or omitted) if no admins are configured yet.
  ADMIN_INSTAGRAM_USER_IDS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  // The one address users write to (email footer, reply-to, error copy). REPLACEMENT_PLAN 2.7.
  SUPPORT_EMAIL: z.string().email(),
  // Disputes and admin alerts go here. Defaults to SUPPORT_EMAIL (see parseEnv).
  DISPUTE_EMAIL: z.string().email().optional(),
  ENABLE_DEV_LOGIN: booleanFlag,
  COMPANY_LEGAL_NAME: requiredString,
  COMPANY_ADDRESS: requiredString,
  COMPANY_STATE: requiredString,
  // Empty (or omitted) until GST-registered; the GST_RATE_BPS>0 startup guard depends on this.
  COMPANY_GSTIN: z.string().default(''),
  COMMISSION_SAC_CODE: requiredString,
  AUTH_EMAIL_ENABLED: booleanFlag,
  // Error reporting (SPEC 20). Blank or omitted means off. A DSN is a public ingest URL, not a secret key.
  SENTRY_DSN: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .url()
      .refine((value) => value.startsWith('https://'), 'must be an https URL')
      .optional(),
  ),
  PAYMENTS_MODE: launchMode,
  DEAL_POSTING_MODE: launchMode,
  // Blank counts as unset: z.coerce.number() would turn '' into 0 and silently drop the GST.
  GST_RATE_BPS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(0).max(10_000).default(DEFAULT_GST_RATE_BPS),
  ),
});

type ParsedEnv = z.infer<typeof envSchema>;

/**
 * The validated environment. `DISPUTE_EMAIL` is always set: it falls back to `SUPPORT_EMAIL`. The two
 * launch modes are always set: `off` in production and `on` elsewhere unless the env var says otherwise.
 */
export type Env = Omit<ParsedEnv, 'DISPUTE_EMAIL' | 'PAYMENTS_MODE' | 'DEAL_POSTING_MODE'> & {
  DISPUTE_EMAIL: string;
  PAYMENTS_MODE: LaunchMode;
  DEAL_POSTING_MODE: LaunchMode;
};
