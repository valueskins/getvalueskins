import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from '../../src/env/parse.js';
import { buildRawTestEnv } from '../testEnv.js';

describe('parseEnv', () => {
  it('parses a fully valid env', () => {
    const env = parseEnv(buildRawTestEnv());

    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(4001);
    expect(env.ENABLE_DEV_LOGIN).toBe(true);
    expect(env.AUTH_EMAIL_ENABLED).toBe(false);
    expect(env.GST_RATE_BPS).toBe(0);
    expect(env.ADMIN_INSTAGRAM_USER_IDS).toEqual([]);
  });

  it('throws EnvValidationError when a required var is missing', () => {
    const raw = buildRawTestEnv();
    delete raw.SESSION_SECRET;

    expect(() => parseEnv(raw)).toThrow(EnvValidationError);
  });

  it('rejects ENABLE_DEV_LOGIN values other than the literal "true"/"false"', () => {
    expect(() => parseEnv(buildRawTestEnv({ ENABLE_DEV_LOGIN: 'yes' }))).toThrow(
      EnvValidationError,
    );
  });

  it('treats the literal string "false" as false, not true (z.coerce.boolean pitfall)', () => {
    const env = parseEnv(buildRawTestEnv({ ENABLE_DEV_LOGIN: 'false' }));
    expect(env.ENABLE_DEV_LOGIN).toBe(false);
  });

  it('allows COOKIE_DOMAIN, ADMIN_INSTAGRAM_USER_IDS, COMPANY_GSTIN, TEST_DATABASE_URL to be empty', () => {
    const env = parseEnv(
      buildRawTestEnv({
        COOKIE_DOMAIN: '',
        ADMIN_INSTAGRAM_USER_IDS: '',
        COMPANY_GSTIN: '',
        TEST_DATABASE_URL: '',
      }),
    );

    expect(env.COOKIE_DOMAIN).toBe('');
    expect(env.ADMIN_INSTAGRAM_USER_IDS).toEqual([]);
    expect(env.COMPANY_GSTIN).toBe('');
    expect(env.TEST_DATABASE_URL).toBe('');
  });

  it('defaults TEST_DATABASE_URL, ADMIN_INSTAGRAM_USER_IDS, COMPANY_GSTIN when omitted (hosts that cannot define empty vars)', () => {
    const raw = buildRawTestEnv();
    delete raw.TEST_DATABASE_URL;
    delete raw.ADMIN_INSTAGRAM_USER_IDS;
    delete raw.COMPANY_GSTIN;

    const env = parseEnv(raw);

    expect(env.TEST_DATABASE_URL).toBe('');
    expect(env.ADMIN_INSTAGRAM_USER_IDS).toEqual([]);
    expect(env.COMPANY_GSTIN).toBe('');
  });

  it('still requires COOKIE_DOMAIN to be present (only the three optional vars default)', () => {
    const raw = buildRawTestEnv();
    delete raw.COOKIE_DOMAIN;

    expect(() => parseEnv(raw)).toThrow(EnvValidationError);
  });

  it('rejects an empty WEB_ORIGIN (must be a valid URL)', () => {
    expect(() => parseEnv(buildRawTestEnv({ WEB_ORIGIN: '' }))).toThrow(EnvValidationError);
  });

  it('splits ADMIN_INSTAGRAM_USER_IDS into a trimmed array', () => {
    const env = parseEnv(buildRawTestEnv({ ADMIN_INSTAGRAM_USER_IDS: ' a, b ,c' }));
    expect(env.ADMIN_INSTAGRAM_USER_IDS).toEqual(['a', 'b', 'c']);
  });

  it('accepts NODE_ENV=test (Vitest sets this automatically)', () => {
    expect(parseEnv(buildRawTestEnv({ NODE_ENV: 'test' })).NODE_ENV).toBe('test');
  });
});
