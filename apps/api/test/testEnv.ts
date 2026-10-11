import { parseEnv } from '../src/env/parse.js';
import type { Env } from '../src/env/schema.js';

const BASE_RAW_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '4001',
  DATABASE_URL: 'postgres://valueskins:valueskins@localhost:5432/valueskins_dev',
  TEST_DATABASE_URL: 'postgres://valueskins:valueskins@localhost:5432/valueskins_test',
  WEB_ORIGIN: 'http://localhost:3000',
  COOKIE_DOMAIN: '',
  SESSION_COOKIE_NAME: 'vs_session_test',
  SESSION_SECRET: 'test-session-secret',
  TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key',
  INSTAGRAM_APP_ID: 'test-ig-app-id',
  INSTAGRAM_APP_SECRET: 'test-ig-app-secret',
  INSTAGRAM_REDIRECT_URI: 'http://localhost:4000/api/auth/instagram/callback',
  META_APP_SECRET: 'test-meta-app-secret',
  RAZORPAY_KEY_ID: 'rzp_test_0000000000000',
  RAZORPAY_KEY_SECRET: 'test-razorpay-key-secret',
  RAZORPAY_WEBHOOK_SECRET: 'test-razorpay-webhook-secret',
  RESEND_API_KEY: 'test-resend-api-key',
  EMAIL_FROM: 'notifications@valueskins.com',
  EMAIL_TRANSPORT: 'console',
  ADMIN_INSTAGRAM_USER_IDS: '',
  SUPPORT_EMAIL: 'valueskinsfounder@gmail.com',
  ENABLE_DEV_LOGIN: 'true',
  COMPANY_LEGAL_NAME: 'Valueskins Private Limited',
  COMPANY_ADDRESS: '123 MG Road, Bengaluru',
  COMPANY_STATE: 'Karnataka',
  COMPANY_GSTIN: '',
  COMMISSION_SAC_CODE: '000000',
  AUTH_EMAIL_ENABLED: 'false',
  GST_RATE_BPS: '0',
};

/** Overrides are raw (pre-parse) strings, so invalid-env tests can pass
 * deliberately bad values through the same validation path as production. */
export function buildTestEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): Env {
  return parseEnv({ ...BASE_RAW_ENV, ...overrides });
}

export function buildRawTestEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...BASE_RAW_ENV, ...overrides };
}
