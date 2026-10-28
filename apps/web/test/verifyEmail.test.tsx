import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SIGNED_OUT_CONFIRMED, VerifyEmail } from '@/components/onboarding/VerifyEmail';
import { apiError, json, mockApi } from './helpers/api';
import { CONFIG, makeMe } from './helpers/fixtures';
import { setSearch } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

const TOKEN = 'a'.repeat(43);

describe('/verify-email', () => {
  it('confirms the email for the signed-in user and continues setup', async () => {
    setSearch(`token=${TOKEN}`);
    const me = makeMe({ role: 'CREATOR' });
    const api = mockApi({
      'GET /me': me,
      'GET /config': CONFIG,
      'POST /me/email/verify': json(200, {
        verified: true,
        email: 'person@example.test',
        onboarding: me.onboarding,
      }),
    });
    renderWithProviders(<VerifyEmail />);
    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeInTheDocument();
    expect(screen.getByText('person@example.test')).toBeInTheDocument();
    expect(api.called('POST /me/email/verify')[0]!.body).toEqual({ token: TOKEN });
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/onboarding');
  });

  it('shows the API message for a bad link', async () => {
    setSearch(`token=${TOKEN}`);
    mockApi({
      'GET /me': makeMe({ role: 'CREATOR', done: ['email', 'profile'] }),
      'GET /config': CONFIG,
      'POST /me/email/verify': apiError(
        400,
        'INVALID_TOKEN',
        'This link is invalid or has expired.',
      ),
    });
    renderWithProviders(<VerifyEmail />);
    expect(await screen.findByText('This link is invalid or has expired.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('says when the address belongs to another account', async () => {
    setSearch(`token=${TOKEN}`);
    mockApi({
      'GET /me': makeMe({ role: 'CREATOR' }),
      'GET /config': CONFIG,
      'POST /me/email/verify': apiError(
        409,
        'EMAIL_TAKEN',
        'That email address is already used by another account.',
      ),
    });
    renderWithProviders(<VerifyEmail />);
    expect(
      await screen.findByRole('heading', { name: 'That email is already used' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('That email address is already used by another account.'),
    ).toBeInTheDocument();
  });

  it('confirms the email for a signed-out visitor too, and offers sign-in without signing them in', async () => {
    setSearch(`token=${TOKEN}`);
    const api = mockApi({
      'GET /me': apiError(401, 'UNAUTHENTICATED'),
      'GET /config': CONFIG,
      'POST /me/email/verify': json(200, {
        verified: true,
        email: 'person@example.test',
        onboarding: null,
      }),
    });
    renderWithProviders(<VerifyEmail />);
    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeInTheDocument();
    expect(api.called('POST /me/email/verify')[0]!.body).toEqual({ token: TOKEN });
    expect(screen.getByText(SIGNED_OUT_CONFIRMED)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with Instagram' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('tells a signed-out visitor with a used or expired link to sign in for a new one', async () => {
    setSearch(`token=${TOKEN}`);
    mockApi({
      'GET /me': apiError(401, 'UNAUTHENTICATED'),
      'GET /config': CONFIG,
      'POST /me/email/verify': apiError(
        400,
        'INVALID_TOKEN',
        'This link is invalid or has expired.',
      ),
    });
    renderWithProviders(<VerifyEmail />);
    expect(
      await screen.findByRole('heading', { name: 'This link did not work' }),
    ).toBeInTheDocument();
    expect(screen.getByText('This link is invalid or has expired.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Sign in with Instagram' })).toBeInTheDocument();
  });
});
