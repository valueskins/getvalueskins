import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingPage from '../app/(temporary)/onboarding/page';
import VerifyEmailPage from '../app/(temporary)/verify-email/page';

const push = vi.fn();
let search = '';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}));

type StepId = 'instagram' | 'email' | 'profile' | 'billing' | 'payout';

function me(options: {
  role?: 'CREATOR' | 'BRAND' | null;
  hasInstagram?: boolean;
  nextStep: StepId | null;
  steps?: Array<{ id: StepId; done: boolean; required: boolean }>;
}) {
  const hasInstagram = options.hasInstagram ?? true;
  return {
    user: {
      id: '01a0e8e8-52b5-75d3-999f-4570bcd490e4',
      instagramUserId: hasInstagram ? 'ig-1' : null,
      username: 'someone',
      role: options.role ?? null,
      isAdmin: false,
      onboardingCompletedAt: null,
      email: null,
      emailVerifiedAt: null,
    },
    profileDetails: null,
    profile: hasInstagram
      ? {
          username: 'creator_handle',
          name: 'Creator Name',
          profilePictureUrl: null,
          followersCount: 1500,
          followsCount: 10,
          mediaCount: 5,
          engagementRate: null,
          instagramSyncedAt: null,
        }
      : null,
    onboarding: {
      completed: options.nextStep === null,
      nextStep: options.nextStep,
      steps: options.steps ?? [],
    },
  };
}

type Handler = (init: RequestInit) => Response | Promise<Response>;

/** fetch routed by "METHOD /path"; every call is recorded. */
function mockApi(routes: Record<string, Handler | Response>) {
  const calls: Array<{ key: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const key = `${init.method ?? 'GET'} ${path}`;
    calls.push({ key, init });
    const route = routes[key];
    if (!route) return new Response('{}', { status: 404 });
    return typeof route === 'function' ? route(init) : route.clone();
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  push.mockReset();
  search = '';
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
});

describe('/onboarding', () => {
  it('shows the signed-out state on a 401', async () => {
    mockApi({ 'GET /api/me': json({ error: {} }, 401) });
    render(<OnboardingPage />);
    expect(await screen.findByText('You are signed out')).toBeInTheDocument();
  });

  it('confirms the Instagram profile, and shows no role question', async () => {
    mockApi({
      'GET /api/me': json(
        me({
          role: 'CREATOR',
          nextStep: 'email',
          steps: [
            { id: 'instagram', done: true, required: true },
            { id: 'email', done: false, required: true },
          ],
        }),
      ),
    });
    render(<OnboardingPage />);

    expect(await screen.findByText('Is this you?')).toBeInTheDocument();
    expect(screen.getByText('@creator_handle')).toBeInTheDocument();
    expect(screen.queryByText('You cannot change this later.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Creator')).not.toBeInTheDocument();
  });

  it('Instagram step (email sign-in): asks to connect Instagram, with no username form', async () => {
    mockApi({
      'GET /api/me': json(
        me({
          hasInstagram: false,
          nextStep: 'instagram',
          steps: [
            { id: 'instagram', done: false, required: true },
            { id: 'email', done: true, required: true },
          ],
        }),
      ),
    });
    render(<OnboardingPage />);

    expect(await screen.findByRole('heading', { name: 'Connect Instagram' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Instagram username')).not.toBeInTheDocument();
    expect(screen.queryByText('Is this you?')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect Instagram' })).toHaveAttribute(
      'href',
      'https://api-staging.valueskins.com/api/auth/instagram/start?link=1',
    );
  });

  it('profile step (creator): disabled until valid, then saves the creator fields', async () => {
    let current = me({
      role: 'CREATOR',
      nextStep: 'profile',
      steps: [{ id: 'profile', done: false, required: true }],
    });
    const calls = mockApi({
      'GET /api/me': () => json(current),
      'PUT /api/me/profile': () => {
        current = me({ role: 'CREATOR', nextStep: null, steps: [] });
        return json({ onboarding: current.onboarding });
      },
    });
    render(<OnboardingPage />);

    const save = await screen.findByRole('button', { name: 'Save profile' });
    expect(save).toBeDisabled();
    expect(screen.queryByLabelText(/Website/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Asha Rao' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } });
    fireEvent.change(screen.getByLabelText('Age (18 to 99)'), { target: { value: '17' } });
    fireEvent.change(screen.getByLabelText('Gender'), { target: { value: 'FEMALE' } });
    fireEvent.click(screen.getByLabelText('I am 18 or older.'));
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Age (18 to 99)'), { target: { value: '24' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await screen.findByText('Your account is set up.');
    const put = calls.find((c) => c.key === 'PUT /api/me/profile')!;
    expect(JSON.parse(put.init.body as string)).toEqual({
      name: 'Asha Rao',
      city: 'Pune',
      age: 24,
      gender: 'FEMALE',
      adultConfirmed: true,
    });
    expect(put.init.credentials).toBe('include');
  });

  it('profile step (brand): asks for a website and a pitch instead of an age and gender', async () => {
    const calls = mockApi({
      'GET /api/me': json(
        me({
          role: 'BRAND',
          nextStep: 'profile',
          steps: [{ id: 'profile', done: false, required: true }],
        }),
      ),
      'PUT /api/me/profile': json({ onboarding: {} }),
    });
    render(<OnboardingPage />);

    fireEvent.change(await screen.findByLabelText('Brand name'), {
      target: { value: 'Acme Foods' },
    });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Mumbai' } });
    fireEvent.change(screen.getByLabelText('Website (starts with https://)'), {
      target: { value: 'https://acme.example' },
    });
    fireEvent.click(screen.getByLabelText('I am 18 or older.'));
    expect(screen.queryByLabelText('Gender')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(calls.some((c) => c.key === 'PUT /api/me/profile')).toBe(true));
    const put = calls.find((c) => c.key === 'PUT /api/me/profile')!;
    expect(JSON.parse(put.init.body as string)).toEqual({
      name: 'Acme Foods',
      city: 'Mumbai',
      website: 'https://acme.example',
      adultConfirmed: true,
    });
  });

  it('profile step: shows the API message when the profile is already saved', async () => {
    mockApi({
      'GET /api/me': json(
        me({
          role: 'CREATOR',
          nextStep: 'profile',
          steps: [{ id: 'profile', done: false, required: true }],
        }),
      ),
      'PUT /api/me/profile': json(
        { error: { message: 'Your profile is saved. Write to help@example.com.' } },
        409,
      ),
    });
    render(<OnboardingPage />);

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Asha Rao' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } });
    fireEvent.change(screen.getByLabelText('Age (18 to 99)'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Gender'), { target: { value: 'MALE' } });
    fireEvent.click(screen.getByLabelText('I am 18 or older.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(
      await screen.findByText('Your profile is saved. Write to help@example.com.'),
    ).toBeInTheDocument();
  });

  it('email step: sends the link, then offers to send it again', async () => {
    const calls = mockApi({
      'GET /api/me': json(me({ role: 'CREATOR', nextStep: 'email' })),
      'POST /api/me/email': json({ ok: true }),
      'POST /api/me/email/resend': json({ ok: true }),
    });
    render(<OnboardingPage />);

    const input = await screen.findByLabelText('Email address');
    expect(screen.getByRole('button', { name: 'Send verification link' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'me@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send verification link' }));

    expect(await screen.findByText(/We sent a link to me@example.com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send the link again' }));
    await waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /api/me/email/resend')).toBe(true),
    );
  });

  it('email step: tells the user when they asked for too many emails', async () => {
    mockApi({
      'GET /api/me': json(me({ role: 'CREATOR', nextStep: 'email' })),
      'POST /api/me/email': json({ error: { message: 'Too many requests' } }, 429),
    });
    render(<OnboardingPage />);

    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send verification link' }));

    expect(await screen.findByText('Too many emails. Try again in an hour.')).toBeInTheDocument();
  });

  it('billing step (brand): validates the GSTIN and sends PUT /api/me/billing', async () => {
    const calls = mockApi({
      'GET /api/me': json(me({ role: 'BRAND', nextStep: 'billing' })),
      'PUT /api/me/billing': json({ onboarding: {} }),
    });
    render(<OnboardingPage />);

    fireEvent.change(await screen.findByLabelText('Billing name'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('Billing address'), { target: { value: '1 Road' } });
    fireEvent.change(screen.getByLabelText('Billing state'), { target: { value: 'Goa' } });
    fireEvent.change(screen.getByLabelText('GSTIN (optional)'), { target: { value: 'bad' } });
    expect(screen.getByRole('button', { name: 'Save billing details' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('GSTIN (optional)'), {
      target: { value: '29abcde1234f1z5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save billing details' }));

    await waitFor(() => expect(calls.some((c) => c.key === 'PUT /api/me/billing')).toBe(true));
    const put = calls.find((c) => c.key === 'PUT /api/me/billing')!;
    expect(JSON.parse(put.init.body as string)).toEqual({
      billingName: 'Acme',
      billingAddress: '1 Road',
      billingState: 'Goa',
      gstin: '29ABCDE1234F1Z5',
    });
  });
});

describe('/onboarding payout section (creators)', () => {
  const completeCreator = () =>
    me({
      role: 'CREATOR',
      nextStep: null,
      steps: [
        { id: 'instagram', done: true, required: true },
        { id: 'email', done: true, required: true },
        { id: 'profile', done: true, required: true },
        { id: 'payout', done: false, required: false },
      ],
    });

  const saved = {
    maskedVpa: 'ra\u2022\u2022\u2022@okhdfcbank',
    name: 'Raj Kumar',
    consentAt: '2026-10-09T04:30:00.000Z',
  };

  function fillForm(vpa = 'raj.creator@okhdfcbank', name = 'Raj Kumar') {
    fireEvent.change(screen.getByLabelText('UPI ID'), { target: { value: vpa } });
    fireEvent.change(screen.getByLabelText(/Name on the account/), { target: { value: name } });
  }

  const consentBox = () => screen.getByLabelText(/I agree my UPI ID and name are shown/);

  it('shows the form with the warning and the consent text, disabled with a reason until complete', async () => {
    mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-upi': json({ payoutUpi: null }),
    });
    render(<OnboardingPage />);

    const submit = await screen.findByRole('button', { name: 'Save UPI details' });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText(/Enter your UPI ID and the name on the account, and accept the consent/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'We do not verify UPI IDs. Enter yours carefully. A payment to a wrong UPI ID cannot be recalled.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'I agree my UPI ID and name are shown to a brand that confirms me on a deal.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Add your UPI ID to apply to deals.')).toBeInTheDocument();
  });

  it('says why a bank account number is not accepted, and keeps the button disabled', async () => {
    mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-upi': json({ payoutUpi: null }),
    });
    render(<OnboardingPage />);

    await screen.findByRole('button', { name: 'Save UPI details' });
    fillForm('123456789012');
    fireEvent.click(consentBox());

    expect(screen.getByText(/looks like a bank account number/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save UPI details' })).toBeDisabled();
  });

  it('saves the details, shows only the masked ID and clears the form', async () => {
    const calls = mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-upi': json({ payoutUpi: null }),
      'PUT /api/me/payout-upi': json({
        payoutUpi: saved,
        onboarding: completeCreator().onboarding,
      }),
    });
    render(<OnboardingPage />);

    await screen.findByRole('button', { name: 'Save UPI details' });
    fillForm();
    fireEvent.click(consentBox());
    fireEvent.click(screen.getByRole('button', { name: 'Save UPI details' }));

    expect(await screen.findByText('ra\u2022\u2022\u2022@okhdfcbank')).toBeInTheDocument();
    expect(screen.getByText('Name on the account: Raj Kumar')).toBeInTheDocument();
    expect(screen.getByText('Consent given on 9 Oct 2026.')).toBeInTheDocument();
    const put = calls.find((c) => c.key === 'PUT /api/me/payout-upi')!;
    expect(JSON.parse(put.init.body as string)).toEqual({
      vpa: 'raj.creator@okhdfcbank',
      name: 'Raj Kumar',
      consent: true,
    });
    // The full ID is not kept on the page, and the form is closed.
    expect(screen.queryByText('raj.creator@okhdfcbank')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('raj.creator@okhdfcbank')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save UPI details' })).not.toBeInTheDocument();
  });

  it('shows the saved details masked, with the form only after Change', async () => {
    mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-upi': json({ payoutUpi: saved }),
    });
    render(<OnboardingPage />);

    expect(await screen.findByText('ra\u2022\u2022\u2022@okhdfcbank')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save UPI details' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change UPI details' }));
    expect(screen.getByRole('button', { name: 'Save UPI details' })).toBeInTheDocument();
    expect(screen.getByLabelText('UPI ID')).toHaveValue('');
  });

  it('shows what the API says when saving is refused', async () => {
    mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-upi': json({ payoutUpi: null }),
      'PUT /api/me/payout-upi': json({ error: { message: 'Too many requests' } }, 429),
    });
    render(<OnboardingPage />);

    await screen.findByRole('button', { name: 'Save UPI details' });
    fillForm();
    fireEvent.click(consentBox());
    fireEvent.click(screen.getByRole('button', { name: 'Save UPI details' }));

    expect(await screen.findByText('Too many requests')).toBeInTheDocument();
  });

  it('does not show payout details to a brand', async () => {
    mockApi({
      'GET /api/me': json(me({ role: 'BRAND', nextStep: null })),
    });
    render(<OnboardingPage />);

    await screen.findByText('Your account is set up.');
    expect(screen.queryByText('Payout setup')).not.toBeInTheDocument();
  });
});

describe('/verify-email', () => {
  it('posts the token once and continues to onboarding', async () => {
    search = 'token=abc123abc123abc123abc123';
    const calls = mockApi({ 'POST /api/me/email/verify': json({ onboarding: {} }) });
    render(<VerifyEmailPage />);

    expect(await screen.findByText('Your email address is verified.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/onboarding');
    expect(calls.filter((c) => c.key === 'POST /api/me/email/verify')).toHaveLength(1);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      token: 'abc123abc123abc123abc123',
    });
  });

  it('asks the user to sign in first on a 401', async () => {
    search = 'token=abc123abc123abc123abc123';
    mockApi({ 'POST /api/me/email/verify': json({ error: {} }, 401) });
    render(<VerifyEmailPage />);

    expect(await screen.findByText(/Sign in first, then open the link/)).toBeInTheDocument();
  });

  it('shows the API message for an invalid or expired link', async () => {
    search = 'token=abc123abc123abc123abc123';
    mockApi({
      'POST /api/me/email/verify': json(
        { error: { message: 'This link is invalid or has expired.' } },
        400,
      ),
    });
    render(<VerifyEmailPage />);

    expect(await screen.findByText('This link is invalid or has expired.')).toBeInTheDocument();
  });

  it('shows an error when the link has no token, without calling the API', async () => {
    const calls = mockApi({});
    render(<VerifyEmailPage />);

    expect(await screen.findByText('This link has no token.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
