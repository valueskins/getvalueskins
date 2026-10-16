import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { apiError, json, mockApi } from './helpers/api';
import { CONFIG, makeMe } from './helpers/fixtures';
import { nav, setSearch } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

const creator = makeMe({ role: 'CREATOR', done: ['email', 'profile', 'payout'] });
const brand = makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] });
const upi = {
  maskedVpa: 'te•••@okfakebank',
  name: 'Test Creator',
  consentAt: '2026-10-14T06:00:00.000Z',
};
const billing = {
  billingName: 'Test Brand LLP',
  billingAddress: '1 Test Road',
  billingState: 'Maharashtra',
  gstin: null,
};

describe('settings', () => {
  it('shows a creator the email, the locked profile, the masked UPI ID and Instagram', async () => {
    mockApi({
      'GET /me': creator,
      'GET /config': CONFIG,
      'GET /me/payout-upi': { payoutUpi: upi },
    });
    renderWithProviders(<SettingsPage />);
    const nav = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Email', 'Profile', 'Get paid by UPI', 'Instagram', 'Delete account']);
    expect(screen.getByText('person@example.test')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(await screen.findByText(/Saved on 14 Oct 2026/)).toBeInTheDocument();
    expect(await screen.findByText('te•••@okfakebank')).toBeInTheDocument();
    expect(screen.getByText('Agreed on 14 Oct 2026')).toBeInTheDocument();
    expect(
      screen.getByText(/Updated from Instagram on 13 Oct 2026, 9:12 am IST/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Billing details')).not.toBeInTheDocument();
  });

  it('changes the UPI ID without ever showing the full one', async () => {
    const api = mockApi({
      'GET /me': creator,
      'GET /config': CONFIG,
      'GET /me/payout-upi': { payoutUpi: upi },
      'PUT /me/payout-upi': json(200, {
        payoutUpi: { ...upi, maskedVpa: 'ne•••@okfakebank' },
        onboarding: creator.onboarding,
      }),
    });
    renderWithProviders(<SettingsPage />);
    const upiPanel = await screen.findByRole('region', { name: 'Get paid by UPI' });
    await within(upiPanel).findByText('te•••@okfakebank');
    fireEvent.click(within(upiPanel).getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('New UPI ID'), {
      target: { value: 'new.id@okfakebank' },
    });
    fireEvent.change(screen.getByLabelText('Name on the account'), {
      target: { value: 'Test Creator' },
    });
    fireEvent.click(screen.getByLabelText(/I agree my UPI ID/));
    fireEvent.click(screen.getByRole('button', { name: 'Save UPI ID' }));
    expect(await screen.findByText('ne•••@okfakebank')).toBeInTheDocument();
    expect(api.called('PUT /me/payout-upi')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('new.id@okfakebank');
  });

  it('shows and edits brand billing', async () => {
    const api = mockApi({
      'GET /me': brand,
      'GET /config': CONFIG,
      'GET /me/billing': { billing },
      'PUT /me/billing': json(200, {
        billing: { ...billing, gstin: '27ABCDE1234F1Z5' },
        onboarding: brand.onboarding,
      }),
    });
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('Test Brand LLP')).toBeInTheDocument();
    expect(screen.getByText('https://brand.example.test')).toBeInTheDocument();
    expect(screen.queryByText('Get paid by UPI')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/GSTIN/), { target: { value: '27abcde1234f1z5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save billing details' }));
    expect(await screen.findByText('27ABCDE1234F1Z5')).toBeInTheDocument();
    expect(api.called('PUT /me/billing')[0]!.body).toMatchObject({ gstin: '27ABCDE1234F1Z5' });
  });

  it('sends a link to a new email and shows the pending state', async () => {
    const api = mockApi({
      'GET /me': brand,
      'GET /config': CONFIG,
      'GET /me/billing': { billing },
      'POST /me/email': json(200, { ok: true }),
    });
    renderWithProviders(<SettingsPage />);
    const emailPanel = await screen.findByRole('region', { name: 'Email' });
    fireEvent.click(within(emailPanel).getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('New email'), { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByText('Confirm new@example.test')).toBeInTheDocument();
    expect(within(emailPanel).getByText('In use')).toBeInTheDocument();
    expect(api.called('POST /me/email')[0]!.body).toEqual({ email: 'new@example.test' });
  });

  it('shows the pending address from GET /me after a reload, in any tab', async () => {
    mockApi({
      'GET /me': makeMe({
        role: 'BRAND',
        done: ['email', 'profile', 'billing'],
        pendingEmail: 'later@example.test',
      }),
      'GET /config': CONFIG,
      'GET /me/billing': { billing },
    });
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('Confirm later@example.test')).toBeInTheDocument();
  });

  it('shows when the person confirmed they are 18 or older', async () => {
    mockApi({ 'GET /me': brand, 'GET /config': CONFIG, 'GET /me/billing': { billing } });
    renderWithProviders(<SettingsPage />);
    const profile = await screen.findByRole('region', { name: 'Profile' });
    expect(within(profile).getByText('18 or older')).toBeInTheDocument();
    expect(within(profile).getByText('Confirmed on 9 Oct 2026')).toBeInTheDocument();
  });

  it('deletes the account after the confirm, naming a deal in progress', async () => {
    const api = mockApi({
      'GET /me': brand,
      'GET /config': CONFIG,
      'GET /me/billing': { billing },
      'GET /deals/mine': { items: [{ title: 'Test reel' }], nextCursor: null },
      'DELETE /me': json(200, { ok: true }),
    });
    renderWithProviders(<SettingsPage />);
    const panel = await screen.findByRole('region', { name: 'Delete account' });
    expect(panel).toHaveTextContent('billing details');
    fireEvent.click(within(panel).getByRole('button', { name: 'Delete account' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete your account?' });
    expect(
      await within(dialog).findByText(
        'You have 1 deal in progress, Test reel. Deleting does not cancel it.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(api.called('DELETE /me')).toHaveLength(1);
  });

  it('keeps the account when the delete fails, with a plain error', async () => {
    mockApi({
      'GET /me': brand,
      'GET /config': CONFIG,
      'GET /me/billing': { billing },
      'GET /deals/mine': { items: [], nextCursor: null },
      'DELETE /me': apiError(500, 'INTERNAL_ERROR', 'boom'),
    });
    renderWithProviders(<SettingsPage />);
    const panel = await screen.findByRole('region', { name: 'Delete account' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Delete account' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await within(dialog).findByText('Something went wrong. Try again.')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('explains a failed Instagram link', async () => {
    setSearch('error=account_linked_elsewhere');
    mockApi({ 'GET /me': brand, 'GET /config': CONFIG, 'GET /me/billing': { billing } });
    renderWithProviders(<SettingsPage />);
    expect(
      await screen.findByText(
        'That Instagram account is already linked to a different ValueSkins account.',
      ),
    ).toBeInTheDocument();
  });
});
