import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MePage from '../app/(temporary)/me/page';

const push = vi.fn();

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push }),
}));

const user = {
  id: '01a0e8e8-52b5-75d3-999f-4570bcd490e4',
  instagramUserId: 'ig-1',
  username: 'creator_handle',
  role: 'CREATOR',
  isAdmin: false,
  onboardingCompletedAt: null,
  email: null,
  emailVerifiedAt: null,
};

const profile = {
  username: 'creator_handle',
  name: 'Creator Name',
  profilePictureUrl: 'https://example.com/pic.jpg',
  followersCount: 123456,
  followsCount: 100,
  mediaCount: 40,
  engagementRate: 3.25,
  instagramSyncedAt: '2026-10-01T10:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  push.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
});

describe('/me', () => {
  it('shows the fetched Instagram profile data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user, profile }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MePage />);

    expect(await screen.findByText('@creator_handle')).toBeInTheDocument();
    expect(screen.getByText('Creator Name')).toBeInTheDocument();
    expect(screen.getByAltText('Profile picture of creator_handle')).toHaveAttribute(
      'src',
      'https://example.com/pic.jpg',
    );
    expect(screen.getByText('1,23,456')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('3.25%')).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api-staging.valueskins.com/api/me');
    expect(init.credentials).toBe('include');
  });

  it('says there are not enough posts when the engagement rate is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ user, profile: { ...profile, engagementRate: null } })),
    );
    render(<MePage />);

    expect(await screen.findByText('Not enough posts yet')).toBeInTheDocument();
  });

  it('offers to link Instagram for an email-only user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          user: { ...user, instagramUserId: null, role: null, email: 'a@example.com' },
          profile: null,
        }),
      ),
    );
    render(<MePage />);

    expect(
      await screen.findByText('No Instagram account is linked to this account.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Link Instagram' })).toHaveAttribute(
      'href',
      'https://api-staging.valueskins.com/api/auth/instagram/start?link=1',
    );
  });

  it('shows the signed-out state on a 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: {} }, 401)));
    render(<MePage />);

    expect(await screen.findByText('You are signed out')).toBeInTheDocument();
  });

  it('shows an error when the response is not the expected shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ nope: true })));
    render(<MePage />);

    expect(
      await screen.findByText('Could not load your account. Reload the page to try again.'),
    ).toBeInTheDocument();
  });

  it('logs out and returns to the home page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ user, profile }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('https://api-staging.valueskins.com/api/auth/logout');
    expect(init.method).toBe('POST');
  });

  it('deletes the account only after the confirm dialog is accepted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ user, profile }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirmMock);
    render(<MePage />);

    const button = await screen.findByRole('button', { name: 'Delete my account' });
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(button);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('https://api-staging.valueskins.com/api/me');
    expect(init.method).toBe('DELETE');
  });
});
