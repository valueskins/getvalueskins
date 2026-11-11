import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { CONNECTING_REASON } from '@/components/public/signInCopy';
import { InstagramButton } from '@/components/public/InstagramButton';
import { WakeApi } from '@/components/WakeApi';
import { instagramSignInUrl } from '@/lib/signIn';
import { apiHasAnswered, resetWakeForTests, wakeApi } from '@/lib/wake';
import { json, mockApi } from './helpers/api';

/** A health answer the test resolves when it chooses. */
function pendingHealth() {
  let resolve: (response: Response) => void = () => {};
  const answer = new Promise<Response>((r) => {
    resolve = r;
  });
  return { answer, resolve };
}

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetWakeForTests();
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the wake-up call', () => {
  it('asks GET /healthz once on the first load, without waiting for the answer', () => {
    const health = pendingHealth();
    const api = mockApi({ 'GET /healthz': () => health.answer });

    render(<WakeApi />);

    // The page is already rendered while the health call is still unanswered.
    expect(api.called('GET /healthz')).toHaveLength(1);
    expect(String(api.fetchMock.mock.calls[0]![0])).toMatch(/\/healthz$/);
    expect(apiHasAnswered()).toBe(false);
  });

  it('asks only once per page load, however many components mount', () => {
    const api = mockApi({ 'GET /healthz': () => pendingHealth().answer });

    const first = render(<WakeApi />);
    first.rerender(<WakeApi />);
    render(<WakeApi />);

    expect(api.called('GET /healthz')).toHaveLength(1);
  });

  it('is part of the app providers, so every page does it', () => {
    const api = mockApi({ 'GET /healthz': () => pendingHealth().answer });

    render(
      <Providers>
        <p>a page</p>
      </Providers>,
    );

    expect(screen.getByText('a page')).toBeInTheDocument();
    expect(api.called('GET /healthz')).toHaveLength(1);
  });

  it('remembers that the API answered', async () => {
    mockApi({ 'GET /healthz': { ok: true } });
    wakeApi();
    await vi.waitFor(() => expect(apiHasAnswered()).toBe(true));
  });

  it('never throws when the call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(() => wakeApi()).not.toThrow();
    await Promise.resolve();
    expect(apiHasAnswered()).toBe(false);
  });
});

describe('the sign-in button while the API wakes', () => {
  it('is an ordinary link once the API has answered', async () => {
    mockApi({ 'GET /healthz': { ok: true } });
    wakeApi();
    await vi.waitFor(() => expect(apiHasAnswered()).toBe(true));
    render(<InstagramButton />);

    const link = screen.getByRole('link', { name: 'Sign in with Instagram' });
    expect(link).toHaveAttribute('href', instagramSignInUrl());
    // The button did not cancel the click (checked after React has seen it); then stop jsdom
    // from trying to navigate.
    let cancelledByButton: boolean | null = null;
    document.addEventListener(
      'click',
      (event) => {
        cancelledByButton = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.click(link);
    expect(cancelledByButton).toBe(false);
    expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows "Connecting..." until the API answers, then goes to the sign-in address', async () => {
    const health = pendingHealth();
    mockApi({ 'GET /healthz': () => health.answer });
    render(<InstagramButton large />);

    // The click is cancelled: the link does not go to a sleeping API.
    expect(fireEvent.click(screen.getByRole('link', { name: 'Sign in with Instagram' }))).toBe(
      false,
    );
    const connecting = await screen.findByRole('button', { name: 'Connecting...' });
    expect(connecting).toBeDisabled();
    expect(connecting).toHaveAttribute('aria-busy', 'true');
    // The reason is shown wherever the button is, not only on the home page.
    expect(screen.getByRole('status')).toHaveTextContent(CONNECTING_REASON);
    expect(assign).not.toHaveBeenCalled();

    await act(async () => health.resolve(json(200, { ok: true })));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(instagramSignInUrl()));
  });

  it('keeps waiting through a loading page that answers 200 without the API body', async () => {
    vi.useFakeTimers();
    let calls = 0;
    mockApi({
      'GET /healthz': () => {
        calls += 1;
        return calls < 3
          ? new Response('<html>Service waking up</html>', {
              status: 200,
              headers: { 'Content-Type': 'text/html' },
            })
          : json(200, { ok: true });
      },
    });
    render(<InstagramButton />);

    fireEvent.click(screen.getByRole('link', { name: 'Sign in with Instagram' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(calls).toBeGreaterThanOrEqual(3);
    expect(assign).toHaveBeenCalledWith(instagramSignInUrl());
  });

  it('says so, and offers "Try again", when the API has not answered after 60 seconds', async () => {
    vi.useFakeTimers();
    mockApi({ 'GET /healthz': () => new Promise<Response>(() => {}) });
    render(<InstagramButton />);

    fireEvent.click(screen.getByRole('link', { name: 'Sign in with Instagram' }));
    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'We could not reach ValueSkins. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('"Try again" waits again, and goes on once the API answers', async () => {
    vi.useFakeTimers();
    let awake = false;
    mockApi({
      'GET /healthz': () => (awake ? json(200, { ok: true }) : new Promise<Response>(() => {})),
    });
    render(<InstagramButton />);
    fireEvent.click(screen.getByRole('link', { name: 'Sign in with Instagram' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    awake = true;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(assign).toHaveBeenCalledWith(instagramSignInUrl());
  });

  it('uses the link-mode address for "Connect Instagram"', async () => {
    mockApi({ 'GET /healthz': { ok: true } });
    wakeApi();
    await vi.waitFor(() => expect(apiHasAnswered()).toBe(true));
    render(<InstagramButton label="Connect Instagram" link />);

    expect(screen.getByRole('link', { name: 'Connect Instagram' })).toHaveAttribute(
      'href',
      expect.stringContaining('/auth/instagram/start?link=1'),
    );
  });
});
