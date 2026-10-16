import { screen, waitFor } from '@testing-library/react';
import {
  LAUNCH_BANNER_BRAND,
  LAUNCH_BANNER_CREATOR,
  PAYMENTS_NOT_OPEN,
  POSTING_NOT_OPEN,
} from '@valueskins/shared';
import { describe, expect, it } from 'vitest';
import AppLayout from '@/app/(app)/layout';
import CampaignsPage from '@/app/(app)/campaigns/page';
import DealsPage from '@/app/(app)/deals/page';
import { DealForm } from '@/components/brand/DealForm';
import { mockApi } from './helpers/api';
import { act, DEAL_ID, makeDeal } from './helpers/deals';
import { renderDeal, meAs } from './helpers/dealPage';
import { CONFIG, makeMe } from './helpers/fixtures';
import { nav } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

const creator = makeMe({ role: 'CREATOR', done: ['email', 'profile', 'payout'] });
const brand = makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] });
const closed = { ...CONFIG, postingOpen: false, paymentsOpen: false };

describe('the launch banner (SPEC 19)', () => {
  it('tells a brand that posting opens soon', async () => {
    nav.pathname = '/campaigns';
    mockApi({
      'GET /me': brand,
      'GET /config': closed,
      'GET /deals/mine': { items: [], nextCursor: null },
    });
    renderWithProviders(
      <AppLayout>
        <CampaignsPage />
      </AppLayout>,
    );
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(LAUNCH_BANNER_BRAND);
    expect(LAUNCH_BANNER_BRAND).toBe(
      'Posting deals opens soon. You can set up your profile and billing, and save drafts.',
    );
  });

  it('tells a creator that deals will appear', async () => {
    nav.pathname = '/deals';
    mockApi({
      'GET /me': creator,
      'GET /config': closed,
      'GET /deals': { items: [], nextCursor: null },
    });
    renderWithProviders(
      <AppLayout>
        <DealsPage />
      </AppLayout>,
    );
    expect(await screen.findByText(LAUNCH_BANNER_CREATOR)).toBeInTheDocument();
    expect(LAUNCH_BANNER_CREATOR).toBe(
      'Deals will appear here once brands start posting. Finish your profile and UPI ID so you can apply.',
    );
    expect(screen.queryByText(LAUNCH_BANNER_BRAND)).not.toBeInTheDocument();
  });

  it('is absent once posting is open for this user, which is how an admin sees `admins` mode', async () => {
    nav.pathname = '/campaigns';
    mockApi({
      'GET /me': brand,
      'GET /config': { ...CONFIG, postingOpen: true, paymentsOpen: false },
      'GET /deals/mine': { items: [], nextCursor: null },
    });
    renderWithProviders(
      <AppLayout>
        <CampaignsPage />
      </AppLayout>,
    );
    await screen.findByRole('heading', { name: 'You have not posted a deal yet' });
    expect(screen.queryByText(LAUNCH_BANNER_BRAND)).not.toBeInTheDocument();
  });

  it('is absent while the config is loading', async () => {
    nav.pathname = '/campaigns';
    mockApi({
      'GET /me': brand,
      'GET /config': () => new Promise<never>(() => {}),
      'GET /deals/mine': { items: [], nextCursor: null },
    });
    renderWithProviders(
      <AppLayout>
        <CampaignsPage />
      </AppLayout>,
    );
    await screen.findByRole('heading', { name: 'You have not posted a deal yet' });
    expect(screen.queryByText(LAUNCH_BANNER_BRAND)).not.toBeInTheDocument();
  });
});

describe('the Publish button while posting is closed', () => {
  function renderForm(config: typeof CONFIG) {
    mockApi({ 'GET /me': meAs('brand'), 'GET /config': config });
    return renderWithProviders(<DealForm draft={null} />);
  }

  it('is disabled with the reason, while Save draft still works', async () => {
    renderForm({ ...CONFIG, postingOpen: false });
    await screen.findByRole('button', { name: 'Publish' });
    // The button is rebuilt once the config arrives, so look it up again.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Publish' })).toHaveAccessibleDescription(
      POSTING_NOT_OPEN,
    );
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  });

  it('is enabled when posting is open', async () => {
    renderForm(CONFIG);
    const publish = await screen.findByRole('button', { name: 'Publish' });
    expect(publish).toBeEnabled();
    expect(screen.queryByText(POSTING_NOT_OPEN)).not.toBeInTheDocument();
  });
});

describe('the ValueSkins fee button while payments are closed', () => {
  it('shows the reason the API gave, and does not start Checkout', async () => {
    const deal = makeDeal('CONFIRMED', {
      allowedActions: [act('PAY_COMMISSION', PAYMENTS_NOT_OPEN), act('CANCEL')],
    });
    const { api } = renderDeal(deal, 'brand');
    const pay = await screen.findByRole('button', { name: /Pay ValueSkins fee/ });
    expect(pay).toBeDisabled();
    expect(pay).toHaveAccessibleDescription(PAYMENTS_NOT_OPEN);
    expect(api.called(`POST /deals/${DEAL_ID}/payments/commission/order`)).toHaveLength(0);
  });
});
