import { act as rtlAct, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DealFeedItem, DealMineItem, MyApplicationItem } from '@valueskins/shared';
import { FeedPage } from '@/components/creator/FeedPage';
import { ApplicationsPage, applicationView } from '@/components/creator/ApplicationsPage';
import { MyDealsPage } from '@/components/creator/MyDealsPage';
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider';
import { mockApi } from './helpers/api';
import { BRAND, CREATOR, makeDeal } from './helpers/deals';
import { renderWithProviders } from './helpers/render';
import { sockets } from './helpers/socket';

function feedItem(over: Partial<DealFeedItem> = {}): DealFeedItem {
  const d = makeDeal('OPEN');
  return {
    id: d.id,
    shortId: d.shortId,
    status: 'OPEN',
    title: d.title,
    description: d.description,
    budgetPaise: d.budgetPaise,
    creatorAmountPaise: d.creatorAmountPaise,
    advancePaise: d.advancePaise,
    finalPaise: d.finalPaise,
    applicationDeadline: '2099-01-10',
    contentUploadDeadline: '2099-01-20',
    dealDeadline: '2099-01-25',
    publishedAt: new Date().toISOString(),
    createdAt: d.createdAt,
    brand: BRAND,
    applied: false,
    ...over,
  };
}

function mine(status: DealMineItem['status'], over: Partial<DealMineItem> = {}): DealMineItem {
  return {
    ...feedItem({ id: `${status}-1`, status }),
    yourTurn: false,
    nextStep: null,
    applicantCount: null,
    applicationsOpen: null,
    creator: null,
    receivedPaise: null,
    completedAt: null,
    cancelledAt: null,
    cancelledByRole: null,
    cancellationReason: null,
    ...over,
  } as DealMineItem;
}

describe('the deals feed', () => {
  it('shows each open deal with the creator’s amount, its badges and dates', async () => {
    mockApi({
      'GET /deals/feed': {
        items: [
          feedItem({ applied: true }),
          feedItem({ id: 'd2', title: 'Second deal', publishedAt: '2020-01-01T00:00:00Z' }),
        ],
        nextCursor: 'c2',
      },
      'GET /me/payout-upi': {
        payoutUpi: {
          maskedVpa: 'te•••@okfakebank',
          name: 'Test',
          consentAt: '2026-10-01T00:00:00Z',
        },
      },
    });
    renderWithProviders(<FeedPage />);
    const card = (await screen.findByRole('link', { name: 'Test kurta reel' })).closest('article')!;
    expect(within(card).getByText('Applied')).toBeInTheDocument();
    expect(within(card).getByText('New')).toBeInTheDocument();
    expect(card).toHaveTextContent('₹9,115.00');
    expect(card).toHaveTextContent('(₹2,734.50 + ₹6,380.50)');
    expect(card).toHaveTextContent('Apply by 10 Jan');
    const second = screen.getByRole('link', { name: 'Second deal' }).closest('article')!;
    expect(within(second).queryByText('New')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show more deals' })).toBeInTheDocument();
    expect(screen.queryByText('Add your UPI ID to apply')).not.toBeInTheDocument();
  });

  it('asks for a UPI ID, and shows the empty state', async () => {
    mockApi({
      'GET /deals/feed': { items: [], nextCursor: null },
      'GET /me/payout-upi': { payoutUpi: null },
    });
    renderWithProviders(<FeedPage />);
    expect(await screen.findByText('Add your UPI ID to apply')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No open deals right now' })).toBeInTheDocument();
  });

  it('offers new deals as a button instead of moving the list', async () => {
    const api = mockApi({
      'GET /deals/feed': { items: [feedItem()], nextCursor: null },
      'GET /me/payout-upi': { payoutUpi: null },
    });
    renderWithProviders(
      <RealtimeProvider>
        <FeedPage />
      </RealtimeProvider>,
    );
    await screen.findByRole('link', { name: 'Test kurta reel' });
    rtlAct(() => sockets.last!.serverEmit('deal:new', { id: 'new-1' }));
    const pill = screen.getByRole('button', { name: '1 new deal' });
    const before = api.called('GET /deals/feed').length;
    fireEvent.click(pill);
    await waitFor(() => expect(api.called('GET /deals/feed').length).toBeGreaterThan(before));
    expect(screen.queryByRole('button', { name: '1 new deal' })).not.toBeInTheDocument();
  });
});

describe('applications', () => {
  const app = (
    over: Partial<MyApplicationItem> = {},
    deal: Partial<MyApplicationItem['deal']> = {},
  ): MyApplicationItem => ({
    id: 'a1',
    dealId: 'd1',
    status: 'APPLIED',
    createdAt: '2026-10-01T05:00:00.000Z',
    deal: {
      id: 'd1',
      shortId: '8K2M4QXZ',
      status: 'OPEN',
      title: 'Test kurta reel',
      budgetPaise: 1_000_000,
      creatorAmountPaise: 911_500,
      applicationDeadline: '2099-01-10',
      brand: BRAND,
      ...deal,
    },
    ...over,
  });

  it('links a row only where the deal page will open', () => {
    const now = new Date('2026-10-05T00:00:00Z');
    expect(applicationView(app(), now)).toMatchObject({
      label: 'Applied',
      link: { text: 'View deal' },
    });
    expect(applicationView(app({}, { applicationDeadline: '2026-10-02' }), now).note).toBe(
      'Applications closed on 2 Oct 2026. The brand can still pick.',
    );
    expect(
      applicationView(app({ status: 'CONFIRMED' }, { status: 'CONFIRMED' }), now),
    ).toMatchObject({ label: 'Confirmed', link: { text: 'Go to deal' } });
    expect(
      applicationView(app({ status: 'REJECTED' }, { status: 'CONFIRMED' }), now),
    ).toMatchObject({ label: 'Not selected', link: null });
    expect(applicationView(app({}, { status: 'CANCELLED' }), now)).toMatchObject({
      label: 'Deal cancelled',
      link: null,
    });
  });

  it('lists the applications', async () => {
    mockApi({ 'GET /applications/mine': { items: [app()], nextCursor: null } });
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByText('Test kurta reel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View deal' })).toHaveAttribute('href', '/deals/d1');
  });
});

describe('my deals', () => {
  it('shows active deals with whose turn it is, and completed ones with what was received', async () => {
    // The two tabs ask for different status lists, so answer by the query string.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const items = url.includes('COMPLETED')
        ? [
            mine('COMPLETED', {
              id: 'done-1',
              title: 'Done deal',
              receivedPaise: 911_500,
              completedAt: '2026-10-11T12:35:00Z',
            }),
          ]
        : [
            mine('COMMISSION_PAID', {
              id: 'act-1',
              title: 'Active deal',
              yourTurn: true,
              nextStep: 'CONFIRM_PAYMENT',
              creator: CREATOR,
            }),
          ];
      return new Response(JSON.stringify({ items, nextCursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<MyDealsPage />);
    expect(await screen.findByRole('link', { name: 'Active deal' })).toBeInTheDocument();
    expect(screen.getByText('Your turn')).toBeInTheDocument();
    expect(screen.getByText('Confirm the payment arrived')).toBeInTheDocument();
    expect(screen.getByText('Step 4 of 9: Advance confirmed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }));
    expect(await screen.findByRole('link', { name: 'Done deal' })).toBeInTheDocument();
    expect(screen.getByText(/received across 1 completed deal/)).toHaveTextContent('₹9,115.00');
  });
});
