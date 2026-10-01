import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailCodeForm } from '../app/(temporary)/_components/EmailCodeForm';
import { EmailStartForm } from '../app/(temporary)/_components/EmailStartForm';

const push = vi.fn();
let search = '';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}));

function mockFetch(status: number) {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  push.mockReset();
  search = '';
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
});

describe('EmailStartForm', () => {
  it('disables the button and says why until the email is valid', () => {
    render(<EmailStartForm />);

    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled();
    expect(screen.getByText('Enter a valid email address to send a code.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'a@example.com' },
    });
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();
  });

  it('posts the email with credentials and moves to the code screen', async () => {
    const fetchMock = mockFetch(200);
    render(<EmailStartForm />);

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/auth/email/code?email=a%40example.com'),
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api-staging.valueskins.com/api/auth/email/start');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@example.com' });
  });

  it('shows a message when rate limited', async () => {
    mockFetch(429);
    render(<EmailStartForm />);

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));

    expect(
      await screen.findByText('Too many attempts. Wait a while and try again.'),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('EmailCodeForm', () => {
  it('asks to start again when there is no email in the URL', () => {
    render(<EmailCodeForm />);
    expect(screen.getByRole('link', { name: 'Start again' })).toHaveAttribute(
      'href',
      '/auth/email',
    );
  });

  it('disables the button and says why until there are 6 digits', () => {
    search = 'email=a%40example.com';
    render(<EmailCodeForm />);

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(
      screen.getByText('Enter the 6-digit code from your email to sign in.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '12ab34' } });
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('1234');
  });

  it('verifies the code and goes to /me', async () => {
    search = 'email=a%40example.com';
    const fetchMock = mockFetch(200);
    render(<EmailCodeForm />);

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/me'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api-staging.valueskins.com/api/auth/email/verify');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@example.com', code: '123456' });
  });

  it('shows an error for a wrong or expired code', async () => {
    search = 'email=a%40example.com';
    mockFetch(400);
    render(<EmailCodeForm />);

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('That code is incorrect or has expired.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
