import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppLayout from '@/app/(app)/layout';
import CampaignsPage from '@/app/(app)/campaigns/page';
import DealsPage from '@/app/(app)/deals/page';
import { apiError, json, mockApi } from './helpers/api';
import { CONFIG, makeMe } from './helpers/fixtures';
import { nav } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

const creator = makeMe({ role: 'CREATOR', done: ['email', 'profile'] });
const brand = makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] });

function renderPage(page: React.ReactElement) {
  return renderWithProviders(<AppLayout>{page}</AppLayout>);
}

describe('the signed-in shell', () => {
  it('shows the creator navigation', async () => {
    nav.pathname = '/deals';
    mockApi({ 'GET /me': creator, 'GET /config': CONFIG });
    renderPage(<DealsPage />);
    const main = await screen.findAllByRole('navigation', { name: 'Main' });
    const links = within(main[0]!)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(links).toEqual(['Deals', 'Applications', 'My deals', 'Settings']);
    expect(within(main[0]!).getByRole('link', { name: 'Deals' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('link', { name: /Post a deal/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Deals' })).toBeInTheDocument();
  });

  it('shows the brand navigation and the Post a deal button', async () => {
    nav.pathname = '/campaigns';
    mockApi({ 'GET /me': brand, 'GET /config': CONFIG });
    renderPage(<CampaignsPage />);
    const main = await screen.findAllByRole('navigation', { name: 'Main' });
    expect(
      within(main[0]!)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Campaigns', 'Settings']);
    // One in the top bar, one in the phone tab bar; CSS shows one or the other.
    const posts = screen.getAllByRole('link', { name: /Post a deal/ });
    expect(posts).toHaveLength(2);
    for (const link of posts) expect(link).toHaveAttribute('href', '/campaigns/new');
  });

  it('gives a creator a tab bar for phones with the same four places', async () => {
    nav.pathname = '/deals';
    mockApi({ 'GET /me': creator, 'GET /config': CONFIG });
    renderPage(<DealsPage />);
    const navs = await screen.findAllByRole('navigation', { name: 'Main' });
    const tabbar = navs[1]!;
    expect(
      within(tabbar)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Deals', 'Applications', 'My deals', 'Settings']);
    expect(within(tabbar).getByRole('link', { name: 'Deals' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('gives a brand a tab bar with Post a deal in the middle, current only on its own page', async () => {
    nav.pathname = '/campaigns/new';
    mockApi({ 'GET /me': brand, 'GET /config': CONFIG });
    renderPage(<CampaignsPage />);
    const navs = await screen.findAllByRole('navigation', { name: 'Main' });
    const tabbar = navs[1]!;
    expect(
      within(tabbar)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Campaigns', 'Post a deal', 'Settings']);
    expect(within(tabbar).getByRole('link', { name: 'Post a deal' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabbar).getByRole('link', { name: 'Campaigns' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('gives an admin a link to the admin pages in the user menu', async () => {
    nav.pathname = '/campaigns';
    mockApi({
      'GET /me': makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'], isAdmin: true }),
      'GET /config': CONFIG,
    });
    renderPage(<CampaignsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /@test\.brand/ }));
    expect(screen.getByRole('menuitem', { name: 'Admin' })).toHaveAttribute('href', '/admin/deals');
  });

  it('moves focus into the phone menu, and back to its button on Escape', async () => {
    nav.pathname = '/campaigns';
    mockApi({ 'GET /me': brand, 'GET /config': CONFIG });
    renderPage(<CampaignsPage />);
    const button = await screen.findByRole('button', { name: 'Open menu' });
    fireEvent.click(button);
    const sheet = document.getElementById('app-sheet')!;
    expect(document.activeElement).toBe(within(sheet).getAllByRole('link')[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.getElementById('app-sheet')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
  });

  it('gives the other role a 404', async () => {
    mockApi({ 'GET /me': creator });
    renderPage(<CampaignsPage />);
    expect(await screen.findByText('404 page')).toBeInTheDocument();

    mockApi({ 'GET /me': brand });
    renderPage(<DealsPage />);
    await waitFor(() => expect(screen.getAllByText('404 page')).toHaveLength(2));
  });

  it('sends a signed-out visitor home, and unfinished setup to onboarding', async () => {
    mockApi({ 'GET /me': apiError(401, 'UNAUTHENTICATED') });
    const first = renderPage(<DealsPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    first.unmount();

    mockApi({ 'GET /me': makeMe({ role: 'BRAND', done: ['email'] }) });
    renderPage(<CampaignsPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding'));
  });

  it('signs out from the user menu, then goes home', async () => {
    const api = mockApi({
      'GET /me': creator,
      'GET /config': CONFIG,
      'POST /auth/logout': json(200, { ok: true }),
    });
    renderPage(<DealsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /@test\.creator/ }));
    expect(screen.getByRole('menu')).toHaveTextContent('Creator');
    fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(api.called('POST /auth/logout')).toHaveLength(1);
  });

  it('shows a plain error and a retry when GET /me fails', async () => {
    mockApi({ 'GET /me': apiError(500, 'INTERNAL_ERROR', 'db down') });
    renderPage(<DealsPage />);
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    expect(screen.queryByText('db down')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
