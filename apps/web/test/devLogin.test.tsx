import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DevLoginPage from '@/app/dev/login/page';
import { json, mockApi } from './helpers/api';
import { CONFIG, makeMe } from './helpers/fixtures';
import { nav } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

describe('/dev/login', () => {
  it('is a 404 unless NEXT_PUBLIC_ENABLE_DEV_LOGIN is "true"', () => {
    expect(() => DevLoginPage()).toThrow('NEXT_NOT_FOUND');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_LOGIN', 'false');
    expect(() => DevLoginPage()).toThrow('NEXT_NOT_FOUND');
  });

  it('signs in as a test user and goes where that user starts', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_LOGIN', 'true');
    const api = mockApi({
      'GET /config': CONFIG,
      'POST /dev/login': json(200, { user: {} }),
      'GET /me': makeMe({ role: 'BRAND' }),
    });
    renderWithProviders(<DevLoginPage />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(screen.getByText('Enter a username to sign in')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'test.brand' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'BRAND' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding'));
    expect(api.called('POST /dev/login')[0]!.body).toEqual({
      username: 'test.brand',
      role: 'BRAND',
    });
  });
});
