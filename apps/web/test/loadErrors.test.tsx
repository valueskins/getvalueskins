import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmailSignIn } from '@/components/public/EmailSignIn';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { apiError, json, mockApi } from './helpers/api';
import { act, DEAL_ID, makeDeal } from './helpers/deals';
import { renderDeal } from './helpers/dealPage';
import { CONFIG, makeMe } from './helpers/fixtures';
import { renderWithProviders } from './helpers/render';

// A read that fails says what did not load and offers Try again, instead of
// a skeleton that never ends or a state that looks real.

const down = () => apiError(500, 'INTERNAL', 'Something went wrong');

describe('failed reads', () => {
  it('shows the deal history sections as failed, and reads them again on Try again', async () => {
    let fail = true;
    const events = () => (fail ? down() : json(200, { items: [], nextCursor: null }));
    const { api } = renderDeal(makeDeal('ADVANCE_PAID'), 'brand', {
      [`GET /deals/${DEAL_ID}/events`]: events,
      [`GET /deals/${DEAL_ID}/emails`]: down,
    });
    expect(await screen.findByText(/We could not load the activity\./)).toBeInTheDocument();
    expect(screen.getByText(/We could not load the emails\./)).toBeInTheDocument();
    const activity = screen.getByRole('region', { name: 'Activity' });
    fail = false;
    fireEvent.click(within(activity).getByRole('button', { name: 'Try again' }));
    expect(await within(activity).findByRole('list')).toBeInTheDocument();
    expect(api.called(`GET /deals/${DEAL_ID}/events`).length).toBeGreaterThan(1);
  });

  it('does not show a failed UPI read as "not ready"', async () => {
    renderDeal(makeDeal('COMMISSION_PAID', { allowedActions: [act('PAY_ADVANCE')] }), 'brand', {
      [`GET /deals/${DEAL_ID}/direct-payment`]: down,
    });
    expect(await screen.findByText('We could not load the payment details')).toBeInTheDocument();
    expect(screen.queryByText('The payment details are not ready yet')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
  });

  it('does not offer email sign-in when the config cannot be read', async () => {
    mockApi({ 'GET /config': down });
    renderWithProviders(<EmailSignIn />);
    expect(await screen.findByText('We could not load the sign-in page')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('warns before deleting when the deals in progress cannot be checked', async () => {
    mockApi({
      'GET /me': makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] }),
      'GET /config': CONFIG,
      'GET /me/billing': { billing: null },
      'GET /deals/mine': down,
    });
    renderWithProviders(<SettingsPage />);
    const panel = await screen.findByRole('region', { name: 'Delete account' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Delete account' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete your account?' });
    expect(
      await within(dialog).findByText(/We could not check for deals in progress\./),
    ).toBeInTheDocument();
  });
});
