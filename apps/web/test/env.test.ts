import { describe, expect, it, vi } from 'vitest';
import { assertSafeWebEnv, isDevLoginEnabled, isProductionTarget } from '../lib/env';

describe('assertSafeWebEnv', () => {
  it('allows dev login against the staging API', () => {
    expect(() =>
      assertSafeWebEnv({
        NEXT_PUBLIC_ENABLE_DEV_LOGIN: 'true',
        NEXT_PUBLIC_API_URL: 'https://api-staging.valueskins.com',
      }),
    ).not.toThrow();
  });

  it('fails the build when dev login is on against the production API', () => {
    expect(() =>
      assertSafeWebEnv({
        NEXT_PUBLIC_ENABLE_DEV_LOGIN: 'true',
        NEXT_PUBLIC_API_URL: 'https://api.valueskins.com',
      }),
    ).toThrow(/NEXT_PUBLIC_ENABLE_DEV_LOGIN/);
  });

  it('allows the production API when dev login is off or unset', () => {
    expect(() =>
      assertSafeWebEnv({ NEXT_PUBLIC_API_URL: 'https://api.valueskins.com' }),
    ).not.toThrow();
    expect(() =>
      assertSafeWebEnv({
        NEXT_PUBLIC_ENABLE_DEV_LOGIN: 'false',
        NEXT_PUBLIC_API_URL: 'https://api.valueskins.com',
      }),
    ).not.toThrow();
  });

  it('allows dev login with an unset API URL (local development)', () => {
    expect(() => assertSafeWebEnv({ NEXT_PUBLIC_ENABLE_DEV_LOGIN: 'true' })).not.toThrow();
  });
});

describe('flags', () => {
  it('turns dev login on only for the literal "true"', () => {
    expect(isDevLoginEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_LOGIN', 'TRUE');
    expect(isDevLoginEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_LOGIN', 'true');
    expect(isDevLoginEnabled()).toBe(true);
  });

  it('treats only the production API host as a production target', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
    expect(isProductionTarget()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.valueskins.com/');
    expect(isProductionTarget()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    expect(isProductionTarget()).toBe(false);
  });
});
