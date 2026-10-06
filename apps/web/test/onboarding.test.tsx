import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

type StepId = 'instagram_username' | 'role' | 'email' | 'billing' | 'payout';

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

  it('role step: confirms the profile, warns that the choice is permanent, and posts the role', async () => {
    let current = me({ nextStep: 'role', steps: [{ id: 'role', done: false, required: true }] });
    const calls = mockApi({
      'GET /api/me': () => json(current),
      'POST /api/me/role': () => {
        current = me({ role: 'CREATOR', nextStep: 'email', steps: [] });
        return json({ onboarding: current.onboarding });
      },
    });
    render(<OnboardingPage />);

    expect(await screen.findByText('Is this you?')).toBeInTheDocument();
    expect(screen.getByText('@creator_handle')).toBeInTheDocument();
    expect(screen.getByText('You cannot change this later.')).toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Save account type' });
    expect(save).toBeDisabled();
    expect(screen.getByText('Choose Creator or Brand to continue.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Creator'));
    fireEvent.click(save);

    await screen.findByRole('heading', { name: 'Verify your email' });
    const post = calls.find((c) => c.key === 'POST /api/me/role')!;
    expect(JSON.parse(post.init.body as string)).toEqual({ role: 'CREATOR' });
    expect(post.init.credentials).toBe('include');
  });

  it('role step: shows the API message when the role is already set', async () => {
    mockApi({
      'GET /api/me': json(me({ nextStep: 'role' })),
      'POST /api/me/role': json(
        { error: { message: 'Your account type is already chosen.' } },
        409,
      ),
    });
    render(<OnboardingPage />);

    fireEvent.click(await screen.findByLabelText('Brand'));
    fireEvent.click(screen.getByRole('button', { name: 'Save account type' }));

    expect(await screen.findByText('Your account type is already chosen.')).toBeInTheDocument();
  });

  it('Instagram username step (email sign-in): disabled with a reason until valid, then posts', async () => {
    const calls = mockApi({
      'GET /api/me': json(me({ hasInstagram: false, nextStep: 'instagram_username' })),
      'POST /api/me/instagram-username': json({ onboarding: {} }),
    });
    render(<OnboardingPage />);

    const input = await screen.findByLabelText('Instagram username');
    expect(screen.getByRole('button', { name: 'Save username' })).toBeDisabled();
    expect(screen.queryByText('Is this you?')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '@Jane.Doe' } });
    expect(screen.getByRole('button', { name: 'Save username' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save username' }));

    await waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /api/me/instagram-username')).toBe(true),
    );
    const post = calls.find((c) => c.key === 'POST /api/me/instagram-username')!;
    expect(JSON.parse(post.init.body as string)).toEqual({ username: '@Jane.Doe' });
    expect(screen.getByRole('link', { name: 'connect Instagram now' })).toHaveAttribute(
      'href',
      'https://api-staging.valueskins.com/api/auth/instagram/start?link=1',
    );
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
        { id: 'role', done: true, required: true },
        { id: 'email', done: true, required: true },
        { id: 'payout', done: false, required: false },
      ],
    });

  const account = (overrides: object = {}) => ({
    payoutAccount: {
      status: 'PENDING',
      setupComplete: true,
      bankLast4: '9012',
      ifsc: 'HDFC0001234',
      requirements: [],
      ...overrides,
    },
  });

  function fillForm() {
    fireEvent.change(screen.getByLabelText(/Legal name/), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('PAN'), { target: { value: 'abcpe1234f' } });
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByLabelText('Bank account number'), {
      target: { value: '123456789012' },
    });
    fireEvent.change(screen.getByLabelText('IFSC'), { target: { value: 'hdfc0001234' } });
    fireEvent.change(screen.getByLabelText('Account holder name'), {
      target: { value: 'Jane Doe' },
    });
  }

  it('shows the form with the consent text, disabled with a reason until complete', async () => {
    mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-account': json({ payoutAccount: null }),
    });
    render(<OnboardingPage />);

    const submit = await screen.findByRole('button', { name: 'Submit payout details' });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/Fill in every field correctly/)).toBeInTheDocument();
    expect(
      screen.getByText('I agree that Razorpay will store my bank and KYC details to pay me.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Your account is set up.')).toBeInTheDocument();
  });

  it('submits the details, shows the status and clears the personal details from the page', async () => {
    const calls = mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-account': json({ payoutAccount: null }),
      'POST /api/me/payout-account': json(account()),
    });
    render(<OnboardingPage />);

    await screen.findByRole('button', { name: 'Submit payout details' });
    fillForm();
    fireEvent.click(screen.getByLabelText(/I agree that Razorpay/));
    fireEvent.click(screen.getByRole('button', { name: 'Submit payout details' }));

    expect(await screen.findByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText(/Bank account ending 9012, IFSC HDFC0001234/)).toBeInTheDocument();
    const post = calls.find((c) => c.key === 'POST /api/me/payout-account')!;
    expect(JSON.parse(post.init.body as string)).toEqual({
      legalName: 'Jane Doe',
      pan: 'ABCPE1234F',
      phone: '9876543210',
      bankAccountNumber: '123456789012',
      ifsc: 'HDFC0001234',
      accountHolderName: 'Jane Doe',
      consent: true,
    });
    expect(screen.queryByText('123456789012')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit payout details' })).not.toBeInTheDocument();
  });

  it('shows what Razorpay rejected, using the API message', async () => {
    mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-account': json({ payoutAccount: null }),
      'POST /api/me/payout-account': json(
        {
          error: { message: 'Razorpay could not accept these details. Check them and try again.' },
        },
        422,
      ),
    });
    render(<OnboardingPage />);

    await screen.findByRole('button', { name: 'Submit payout details' });
    fillForm();
    fireEvent.click(screen.getByLabelText(/I agree that Razorpay/));
    fireEvent.click(screen.getByRole('button', { name: 'Submit payout details' }));

    expect(
      await screen.findByText('Razorpay could not accept these details. Check them and try again.'),
    ).toBeInTheDocument();
  });

  it('Refresh status fetches the status from the API and shows it', async () => {
    const calls = mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-account': json(account()),
      'POST /api/me/payout-account/refresh': json(account({ status: 'ACTIVE' })),
    });
    render(<OnboardingPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh status' }));

    expect(await screen.findByText('ACTIVE')).toBeInTheDocument();
    expect(
      screen.getByText('Your payout account is active. You can apply to deals.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Razorpay will send this to your bank account on its settlement schedule.'),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /api/me/payout-account/refresh')).toBe(true);
  });

  it('NEEDS_CLARIFICATION lists the reasons and offers the form again', async () => {
    mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-account': json(
        account({
          status: 'NEEDS_CLARIFICATION',
          requirements: [
            {
              fieldReference: 'settlements.beneficiary_name',
              reasonCode: 'needs_clarification',
              status: 'required',
            },
          ],
        }),
      ),
    });
    render(<OnboardingPage />);

    const list = await screen.findByRole('list', { name: '' });
    expect(
      within(list).getByText(/settlements.beneficiary_name: needs clarification/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit payout details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeInTheDocument();
  });

  it('an interrupted setup says so and offers the form to resume', async () => {
    mockApi({
      'GET /api/me': json(completeCreator()),
      'GET /api/me/payout-account': json(
        account({ setupComplete: false, bankLast4: null, ifsc: null }),
      ),
    });
    render(<OnboardingPage />);

    expect(await screen.findByText(/Setup was interrupted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit payout details' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh status' })).not.toBeInTheDocument();
  });

  it('does not show payout setup to a brand', async () => {
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
