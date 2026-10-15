import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResumeResponse } from '@valueskins/shared';
import { HOVER_OPEN_MS, ResumeCard } from '@/components/resume/ResumeCard';
import { apiError, mockApi } from './helpers/api';
import { renderWithProviders } from './helpers/render';

const ID = '0190a0e8-52b5-75d3-999f-4570bcd49111';

function resume(over: Partial<ResumeResponse['user']> = {}): ResumeResponse {
  return {
    user: {
      id: ID,
      role: 'CREATOR',
      username: 'test.creator',
      name: 'Test Creator',
      profilePictureUrl: null,
      instagramVerified: true,
      igAccountType: 'MEDIA_CREATOR',
      followersCount: 48230,
      engagementRate: 3.84,
      city: 'Pune',
      age: 24,
      gender: 'FEMALE',
      website: null,
      pitch: null,
      contactEmail: 'creator@example.test',
      memberSince: '2026-03-02T05:00:00.000Z',
      ...over,
    },
    stats: { completedDealsCount: 2, totalValuePaise: 2450000 },
    completedDeals: [
      {
        counterparty: { id: 'b1', username: 'test.brand' },
        budgetPaise: 1800000,
        title: 'Test reel',
        completedAt: '2026-09-21T06:00:00.000Z',
      },
      {
        counterparty: { id: 'b2', username: 'Deleted user' },
        budgetPaise: 650000,
        title: 'Old post',
        completedAt: '2026-09-02T06:00:00.000Z',
      },
    ],
  };
}

function setPointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: coarse,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ResumeCard', () => {
  it('opens after a short pause on hover, and loads only then', async () => {
    setPointer(false);
    const api = mockApi({ [`GET /users/${ID}/resume`]: resume() });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<ResumeCard userId={ID} username="test.creator" />);
    const trigger = screen.getByRole('button', { name: /@test\.creator/ });
    expect(api.calls).toHaveLength(0);

    fireEvent.mouseEnter(trigger.parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_MS - 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60));
    const card = await screen.findByRole('dialog', { name: 'About @test.creator' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Test Creator')).toBeInTheDocument();
    expect(card).toHaveTextContent('Pune');
    expect(card).toHaveTextContent('Female');
    expect(card).toHaveTextContent('48,230');
    expect(card).toHaveTextContent('3.84%');
    expect(card).toHaveTextContent('Contact: creator@example.test');
    expect(card).toHaveTextContent('₹24,500.00');
    expect(card).toHaveTextContent('Mar 2026');
    expect(card).toHaveTextContent('@test.brand, 21 Sep 2026');
    expect(card).toHaveTextContent('Deleted user, 2 Sep 2026');
    expect(api.calls).toHaveLength(1);
  });

  it('opens from the keyboard and closes on Escape, giving focus back', async () => {
    setPointer(false);
    mockApi({ [`GET /users/${ID}/resume`]: resume() });
    renderWithProviders(<ResumeCard userId={ID} username="test.creator" />);
    const trigger = screen.getByRole('button', { name: /@test\.creator/ });
    trigger.focus();
    // Enter and Space on a button fire click.
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('opens as a bottom sheet on a touch screen', async () => {
    setPointer(true);
    mockApi({ [`GET /users/${ID}/resume`]: resume() });
    renderWithProviders(<ResumeCard userId={ID} username="test.creator" />);
    fireEvent.click(screen.getByRole('button', { name: /@test\.creator/ }));
    const sheet = await screen.findByRole('dialog', { name: 'About @test.creator' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet).toHaveClass('sheet-bottom');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a brand its website and pitch, and leaves out what is not saved', async () => {
    setPointer(false);
    mockApi({
      [`GET /users/${ID}/resume`]: resume({
        role: 'BRAND',
        igAccountType: 'BUSINESS',
        age: null,
        gender: null,
        website: 'https://www.brand.example.test',
        pitch: 'We make test things.',
        contactEmail: null,
      }),
    });
    renderWithProviders(<ResumeCard userId={ID} username="test.brand" />);
    fireEvent.click(screen.getByRole('button', { name: /@test\.brand/ }));
    const card = await screen.findByRole('dialog');
    expect(await screen.findByText('brand.example.test')).toBeInTheDocument();
    expect(card).toHaveTextContent('We make test things.');
    expect(card).toHaveTextContent('Business account');
    expect(card).not.toHaveTextContent('Age');
    expect(card).not.toHaveTextContent('Contact:');
  });

  it('says when the profile is not available', async () => {
    setPointer(false);
    mockApi({ [`GET /users/${ID}/resume`]: apiError(404, 'NOT_FOUND', 'Not found') });
    renderWithProviders(<ResumeCard userId={ID} username="gone" />);
    fireEvent.click(screen.getByRole('button', { name: /@gone/ }));
    expect(
      await screen.findByText('This profile is not available. The account may have been deleted.'),
    ).toBeInTheDocument();
  });
});
