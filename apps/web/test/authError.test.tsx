import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { INSTAGRAM_PROFESSIONAL_ACCOUNT_REQUIRED } from '@valueskins/shared';
import AuthErrorPage from '../app/(temporary)/auth/error/page';
import { GENERIC_AUTH_ERROR, authErrorMessage } from '../lib/temporary/authErrors';
import { temporaryRedirects } from '../lib/temporary/redirects';

describe('/auth/error', () => {
  it('shows the professional account copy for professional_account_required', async () => {
    render(
      await AuthErrorPage({
        searchParams: Promise.resolve({ error: 'professional_account_required' }),
      }),
    );
    expect(screen.getByText(INSTAGRAM_PROFESSIONAL_ACCOUNT_REQUIRED)).toBeInTheDocument();
  });

  it('maps every code the API can send to its own message', () => {
    for (const code of [
      'state_invalid',
      'instagram_failed',
      'professional_account_required',
      'must_be_logged_in',
      'account_linked_elsewhere',
    ]) {
      expect(authErrorMessage(code)).not.toBe(GENERIC_AUTH_ERROR);
    }
  });

  it('falls back to a generic message for an unknown or missing code', () => {
    expect(authErrorMessage('nope')).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage('toString')).toBe(GENERIC_AUTH_ERROR);
  });

  it('has redirects for every path the API sends the browser to', () => {
    const sources = temporaryRedirects.map((r) => r.source);
    expect(sources).toEqual(['/home', '/login', '/settings']);
  });
});
