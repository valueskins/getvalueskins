import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_TYPE_UNSUPPORTED } from '@valueskins/shared';
import LoginPage from '@/app/(public)/login/page';
import { ACCOUNT_REJECTED, SignInError } from '@/components/public/SignInError';
import { mockApi } from './helpers/api';
import { CONFIG } from './helpers/fixtures';
import { nav, setSearch } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

function show(code: string) {
  mockApi({ 'GET /config': CONFIG });
  return renderWithProviders(<SignInError code={code} />);
}

describe('/login?error=', () => {
  it('explains a personal account and how to switch', async () => {
    show('account_type_unsupported');
    expect(
      screen.getByRole('heading', { name: 'This Instagram account cannot sign in' }),
    ).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_TYPE_UNSUPPORTED)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How to switch' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: CONFIG.supportEmail })).toHaveAttribute(
      'href',
      `mailto:${CONFIG.supportEmail}`,
    );
  });

  it('explains an account Instagram did not accept, with the switch steps and Sign in again', async () => {
    show('instagram_account_rejected');
    expect(
      screen.getByRole('heading', { name: 'Instagram did not accept this account' }),
    ).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_REJECTED)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'If it is a personal account' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText(/switching makes it public/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toBeInTheDocument();
  });

  it('explains a blocked account type change, with the support address', async () => {
    show('account_type_change_blocked');
    expect(screen.getByRole('heading', { name: 'Your account type changed' })).toBeInTheDocument();
    expect(
      await screen.findByText(new RegExp(`Write to ${CONFIG.supportEmail}`)),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Write to us/ })).toHaveAttribute(
      'href',
      `mailto:${CONFIG.supportEmail}`,
    );
  });

  it('words each other code, and falls back for an unknown one', () => {
    const cases: Array<[string, string]> = [
      ['instagram_failed', 'Instagram sign-in did not complete. Start again.'],
      [
        'state_invalid',
        'The sign-in expired or was opened in a different browser. Start again from the first page.',
      ],
      ['must_be_logged_in', 'Sign in first, then connect your Instagram account.'],
      [
        'account_linked_elsewhere',
        'That Instagram account is already linked to a different ValueSkins account.',
      ],
      ['something_new', 'Something went wrong while signing in. Start again.'],
    ];
    for (const [code, text] of cases) {
      const { unmount } = show(code);
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Sign in with Instagram' })).toBeInTheDocument();
      unmount();
    }
  });

  it('sends a bare /login to the home page', () => {
    setSearch('');
    render(<LoginPage />);
    expect(nav.replace).toHaveBeenCalledWith('/');
  });
});
