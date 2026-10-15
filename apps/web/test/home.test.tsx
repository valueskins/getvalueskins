import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from '@/components/public/HomePage';
import { apiError, mockApi } from './helpers/api';
import { CONFIG, makeMe } from './helpers/fixtures';
import { nav } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

describe('Home', () => {
  it('signs in with Instagram through the API, and hides email sign-in unless /config allows it', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
    mockApi({ 'GET /config': CONFIG, 'GET /me': apiError(401, 'UNAUTHENTICATED') });
    renderWithProviders(<HomePage />);

    const instagram = screen.getByRole('link', { name: 'Sign in with Instagram' });
    expect(instagram).toHaveAttribute(
      'href',
      'https://api-staging.valueskins.com/api/auth/instagram/start',
    );
    expect(
      screen.getByText('Your Instagram account must be public and a Business or Creator account.'),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText('₹750.00 + GST ₹135.00, through Razorpay')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: 'Sign in with email' })).not.toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('offers email sign-in on staging, when /config says it is on', async () => {
    mockApi({
      'GET /config': { ...CONFIG, authEmailEnabled: true },
      'GET /me': apiError(401, 'UNAUTHENTICATED'),
    });
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('link', { name: 'Sign in with email' })).toHaveAttribute(
      'href',
      '/signin/email',
    );
  });

  it('shows the example amounts from computeBreakdown', async () => {
    mockApi({ 'GET /config': CONFIG, 'GET /me': apiError(401, 'UNAUTHENTICATED') });
    renderWithProviders(<HomePage />);
    const card = screen.getByLabelText('Example: a ₹10,000.00 deal');
    expect(card).toHaveTextContent('₹885.00');
    expect(card).toHaveTextContent('₹2,734.50');
    expect(card).toHaveTextContent('₹6,380.50');
    expect(card).toHaveTextContent('₹9,115.00');
  });

  it('sends a signed-in user to where they start', async () => {
    mockApi({
      'GET /config': CONFIG,
      'GET /me': makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] }),
    });
    renderWithProviders(<HomePage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/campaigns'));
  });
});
