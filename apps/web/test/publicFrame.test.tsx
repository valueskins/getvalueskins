import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicFrame } from '@/components/shell/SiteChrome';
import { mockApi } from './helpers/api';
import { CONFIG } from './helpers/fixtures';
import { nav } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

describe('the public frame', () => {
  it("has the home page's navigation bar, with links back to its sections and to How it works", () => {
    nav.pathname = '/how-it-works';
    mockApi({ 'GET /config': CONFIG });
    renderWithProviders(
      <PublicFrame>
        <main id="main">Page</main>
      </PublicFrame>,
    );
    const site = screen.getByRole('navigation', { name: 'Site' });
    const links = within(site).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['For brands', '/#brands'],
      ['For creators', '/#creators'],
      ['How it works', '/how-it-works'],
      ['FAQ', '/#faq'],
    ]);
    expect(within(site).getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'ValueSkins, home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });

  it('puts only the navigation bar inside the home styles, and keeps the page outside them', () => {
    nav.pathname = '/terms';
    mockApi({ 'GET /config': CONFIG });
    const { container } = renderWithProviders(
      <PublicFrame>
        <main id="main">Page</main>
      </PublicFrame>,
    );
    const chrome = container.querySelector('.hm.hm-chrome')!;
    expect(chrome).toContainElement(screen.getByRole('navigation', { name: 'Site' }));
    expect(chrome).not.toContainElement(screen.getByRole('main'));
    expect(chrome).not.toContainElement(screen.getByRole('contentinfo'));
  });

  it('shows the footer unless a page asks for none', () => {
    nav.pathname = '/dev/login';
    mockApi({ 'GET /config': CONFIG });
    const { unmount } = renderWithProviders(
      <PublicFrame>
        <main id="main">Page</main>
      </PublicFrame>,
    );
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    unmount();
    renderWithProviders(
      <PublicFrame footer={false}>
        <main id="main">Page</main>
      </PublicFrame>,
    );
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });
});
