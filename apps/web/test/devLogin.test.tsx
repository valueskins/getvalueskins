import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DevLoginPage from '../app/(temporary)/dev/login/page';
import { assertSafeWebEnv } from '../lib/temporary/envGuard';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
}));

describe('/dev/login', () => {
  it('is a 404 unless NEXT_PUBLIC_ENABLE_DEV_LOGIN is "true"', () => {
    expect(() => DevLoginPage()).toThrow();

    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_LOGIN', 'false');
    expect(() => DevLoginPage()).toThrow();
  });

  it('renders the form when the flag is on, with the reason the button is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_LOGIN', 'true');
    render(<DevLoginPage />);

    expect(screen.getByRole('heading', { name: 'Dev login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dev login' })).toBeDisabled();
    expect(screen.getByText('Enter a username to log in.')).toBeInTheDocument();
  });
});

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
