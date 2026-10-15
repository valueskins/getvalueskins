import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MeResponse } from '@valueskins/shared';
import { NOT_A_UPI_ID_BANK_ACCOUNT } from '@valueskins/shared';
import { OnboardingFlow, screenFor } from '@/components/onboarding/OnboardingFlow';
import { useMe } from '@/lib/api/queries';
import { apiError, json, mockApi } from './helpers/api';
import { CONFIG, makeMe } from './helpers/fixtures';
import { nav } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

/** Renders the flow from the cached GET /me, as the onboarding page does. */
function Flow() {
  const me = useMe();
  return me.data ? <OnboardingFlow me={me.data} /> : null;
}

function start(me: MeResponse, routes: Record<string, unknown> = {}) {
  const api = mockApi({ 'GET /me': me, 'GET /config': CONFIG, ...routes });
  const view = renderWithProviders(<Flow />);
  return { api, ...view };
}

const fresh = makeMe({ role: 'CREATOR' });
const emailDoneCreator = makeMe({ role: 'CREATOR', done: ['email'] });
const emailDoneBrand = makeMe({ role: 'BRAND', done: ['email'] });

describe('screenFor', () => {
  it('follows the API steps, adding only the "This is me" confirmation', () => {
    expect(screenFor(makeMe({ role: null, done: ['email'] }), false)).toBe('connect');
    expect(screenFor(fresh, false)).toBe('instagram');
    expect(screenFor(fresh, true)).toBe('email');
    expect(screenFor(emailDoneCreator, false)).toBe('profile');
    expect(screenFor(makeMe({ role: 'BRAND', done: ['email', 'profile'] }), false)).toBe('billing');
    expect(screenFor(makeMe({ role: 'CREATOR', done: ['email', 'profile'] }), false)).toBe(
      'payout',
    );
    expect(
      screenFor(makeMe({ role: 'CREATOR', done: ['email', 'profile', 'payout'] }), false),
    ).toBe('done');
    expect(screenFor(makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] }), false)).toBe(
      'done',
    );
  });
});

describe('onboarding', () => {
  it('asks "Is this you?" with the Instagram details, then moves to email', async () => {
    start(fresh);
    expect(await screen.findByRole('heading', { name: 'Is this you?' })).toBeInTheDocument();
    expect(screen.getByText('Creator account')).toBeInTheDocument();
    expect(screen.getByText('48,230')).toBeInTheDocument();
    expect(screen.getByText('3.84%')).toBeInTheDocument();
    expect(screen.getByText('A test bio.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Steps' })).toHaveTextContent('To apply');

    fireEvent.click(screen.getByRole('button', { name: 'This is me' }));
    expect(await screen.findByRole('heading', { name: 'Add your email' })).toBeInTheDocument();
  });

  it('sends the email link, then shows the inbox state with resend and its limit', async () => {
    window.sessionStorage.setItem(`vs:ig-confirmed:${fresh.user.id}`, '1');
    const { api } = start(fresh, {
      'POST /me/email': json(200, { ok: true }),
      'POST /me/email/resend': apiError(429, 'RATE_LIMITED', 'Too many requests'),
    });
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'Person@Example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(api.called('POST /me/email')[0]!.body).toEqual({ email: 'Person@Example.test' });
    expect(screen.getByText('person@example.test')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send the link again' }));
    expect(await screen.findByText('Too many emails. Try again in an hour.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send the link again' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(await screen.findByRole('heading', { name: 'Add your email' })).toBeInTheDocument();
  });

  it('checks the email before sending', async () => {
    window.sessionStorage.setItem(`vs:ig-confirmed:${fresh.user.id}`, '1');
    const { api } = start(fresh);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(
      await screen.findByText('Enter an email address like name@example.com.'),
    ).toBeInTheDocument();
    expect(api.called('POST /me/email')).toHaveLength(0);
  });

  it('saves a creator profile with the 18+ confirmation and no brand fields', async () => {
    const saved = makeMe({ role: 'CREATOR', done: ['email', 'profile'] });
    const { api } = start(emailDoneCreator, {
      'PUT /me/profile': json(200, {
        profileDetails: saved.profileDetails,
        onboarding: saved.onboarding,
      }),
    });
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Website')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Creator' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } });
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Gender'), { target: { value: 'FEMALE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Confirm that you are 18 or older.')).toBeInTheDocument();
    expect(api.called('PUT /me/profile')).toHaveLength(0);

    fireEvent.click(screen.getByLabelText('I am 18 or older.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('heading', { name: 'Get paid by UPI' })).toBeInTheDocument();
    expect(api.called('PUT /me/profile')[0]!.body).toEqual({
      name: 'Test Creator',
      city: 'Pune',
      age: 24,
      gender: 'FEMALE',
      adultConfirmed: true,
    });
  });

  it('shows the brand profile fields with the pitch counter, and a locked profile as text', async () => {
    start(emailDoneBrand, {
      'PUT /me/profile': apiError(
        409,
        'PROFILE_LOCKED',
        'Your profile is saved and cannot be changed here.',
      ),
    });
    expect(await screen.findByRole('heading', { name: 'Your brand profile' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Age')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Hiring pitch/), { target: { value: 'Short pitch' } });
    expect(screen.getByText('11 / 1000')).toBeInTheDocument();

    // The error summary names the brand's own field.
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('link', { name: /^Brand name:/ })).toHaveAttribute(
      'href',
      '#profile-name',
    );

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Test Brand' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Mumbai' } });
    fireEvent.change(screen.getByLabelText('Website'), {
      target: { value: 'https://brand.example.test' },
    });
    fireEvent.click(screen.getByLabelText('I am 18 or older.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(
      await screen.findByText('Your profile is saved and cannot be changed here.'),
    ).toBeInTheDocument();
  });

  it('saves brand billing and then goes home', async () => {
    const before = makeMe({ role: 'BRAND', done: ['email', 'profile'] });
    const after = makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] });
    const billing = {
      billingName: 'Test Brand LLP',
      billingAddress: '1 Test Road',
      billingState: 'Maharashtra',
      gstin: null,
    };
    const { api } = start(before, {
      'PUT /me/billing': json(200, { billing, onboarding: after.onboarding }),
    });
    expect(await screen.findByRole('heading', { name: 'Billing details' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Steps' })).not.toHaveTextContent('To apply');

    fireEvent.change(screen.getByLabelText('Billing name'), {
      target: { value: 'Test Brand LLP' },
    });
    fireEvent.change(screen.getByLabelText('Billing address'), {
      target: { value: '1 Test Road' },
    });
    fireEvent.change(screen.getByLabelText('State or union territory'), {
      target: { value: 'Maharashtra' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and finish' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/home'));
    expect(api.called('PUT /me/billing')[0]!.body).toEqual({
      billingName: 'Test Brand LLP',
      billingAddress: '1 Test Road',
      billingState: 'Maharashtra',
    });
  });

  it('explains a bank account number in the UPI field, and never shows the full UPI ID after saving', async () => {
    const before = makeMe({ role: 'CREATOR', done: ['email', 'profile'] });
    const after = makeMe({ role: 'CREATOR', done: ['email', 'profile', 'payout'] });
    const { api } = start(before, {
      'PUT /me/payout-upi': json(200, {
        payoutUpi: {
          maskedVpa: 'te•••@okfakebank',
          name: 'Test Creator',
          consentAt: '2026-10-14T06:00:00.000Z',
        },
        onboarding: after.onboarding,
      }),
    });
    expect(await screen.findByRole('heading', { name: 'Get paid by UPI' })).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save UPI ID' });
    expect(save).toBeDisabled();
    expect(screen.getByText('Enter a valid UPI ID first')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('UPI ID'), { target: { value: '5010 0234 5678 90' } });
    expect(screen.getByText(NOT_A_UPI_ID_BANK_ACCOUNT)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('UPI ID'), {
      target: { value: 'test.creator@okfakebank' },
    });
    fireEvent.change(screen.getByLabelText('Name on the account'), {
      target: { value: 'Test Creator' },
    });
    expect(screen.getByText('Tick the box to agree first')).toBeInTheDocument();
    expect(screen.getByText('te•••@okfakebank')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/I agree my UPI ID and name are shown/));
    fireEvent.click(screen.getByRole('button', { name: 'Save UPI ID' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/home'));
    expect(api.called('PUT /me/payout-upi')[0]!.body).toEqual({
      vpa: 'test.creator@okfakebank',
      name: 'Test Creator',
      consent: true,
    });
    expect(document.body.textContent).not.toContain('test.creator@okfakebank');
  });

  it('lets a creator add the UPI ID later', async () => {
    start(makeMe({ role: 'CREATOR', done: ['email', 'profile'] }));
    expect(await screen.findByRole('link', { name: 'Do this later' })).toHaveAttribute(
      'href',
      '/home',
    );
    expect(
      screen.getByText('Setup is done. Add a UPI ID now, or later before you apply.'),
    ).toBeInTheDocument();
  });

  it('asks an email-only account to connect Instagram', async () => {
    start(makeMe({ role: null, done: ['email'] }));
    expect(
      await screen.findByRole('heading', { name: 'Connect your Instagram' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect Instagram' }).getAttribute('href')).toMatch(
      /\/api\/auth\/instagram\/start\?link=1$/,
    );
  });

  it('goes home when everything is done', async () => {
    start(makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/home'));
  });
});
