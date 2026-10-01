import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HomePage from '../app/(temporary)/page';

describe('home page', () => {
  it('shows the SPEC 18 tagline, both pitches and the Instagram button', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
    render(<HomePage />);

    expect(
      screen.getByText('ValueSkins - Where creators and brands connect to collaborate.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Brands: Post a deal. Select a creator. Pay. Done.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Creators: Browse deals. Apply. Deliver. Get paid.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue with Instagram' })).toHaveAttribute(
      'href',
      'https://api-staging.valueskins.com/api/auth/instagram/start',
    );
  });

  it('shows "Sign in with email" only when the email flag is on', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_EMAIL_ENABLED', 'true');
    const { unmount } = render(<HomePage />);
    expect(screen.getByRole('link', { name: 'Sign in with email' })).toHaveAttribute(
      'href',
      '/auth/email',
    );
    unmount();

    vi.stubEnv('NEXT_PUBLIC_AUTH_EMAIL_ENABLED', 'false');
    render(<HomePage />);
    expect(screen.queryByRole('link', { name: 'Sign in with email' })).not.toBeInTheDocument();
  });
});
