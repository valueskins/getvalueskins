import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '@/app/(landing)/page';
import { cleanDigits, initialDigits, quote } from '@/components/landing/amount';
import { Landing } from '@/components/landing/Landing';
import { useCountUp } from '@/components/landing/motion';
import { ACCOUNT_NOTE, CONNECTING_REASON, SignIn } from '@/components/landing/SignIn';
import { resetWakeForTests } from '@/lib/wake';
import { apiError, mockApi } from './helpers/api';
import { CONFIG, makeMe } from './helpers/fixtures';
import { nav } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

// jsdom has no matchMedia, so the page renders as it does under reduced motion: every part at its
// final state, with nothing moving.

const SIGNED_OUT = { 'GET /config': CONFIG, 'GET /me': apiError(401, 'UNAUTHENTICATED') };

function renderHome(digits = '10000') {
  return renderWithProviders(<Landing initialDigits={digits} />);
}

function amountInput() {
  return screen.getByRole('textbox', { name: 'Deal amount in rupees' });
}

function result() {
  return screen.getByLabelText('Your deal');
}

describe('Home', () => {
  it('says what this is, and signs in with Instagram through the API', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
    mockApi(SIGNED_OUT);
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Where Indian brands and creators work together',
    );
    const links = screen.getAllByRole('link', { name: /^Sign in/ });
    expect(links.map((a) => a.textContent)).toEqual([
      'Sign in',
      'Sign in with Instagram',
      'Sign in with Instagram',
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute(
        'href',
        'https://api-staging.valueskins.com/api/auth/instagram/start',
      );
    }
    expect(screen.getAllByText(ACCOUNT_NOTE)).toHaveLength(2);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('comes in reading order: the navigation, then the headline', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    const site = screen.getByRole('navigation', { name: 'Site' });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(site.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      within(site)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['#brands', '#creators', '#how', '#faq']);
  });

  it('opens and closes the phone menu from the keyboard', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menu);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides email sign-in unless /config allows it', async () => {
    mockApi(SIGNED_OUT);
    renderHome();
    await screen.findByText('Whole rupees, ₹886.00 or more.');
    expect(screen.queryByRole('link', { name: 'Sign in with email' })).not.toBeInTheDocument();
  });

  it('offers email sign-in on staging, when /config says it is on', async () => {
    mockApi({ ...SIGNED_OUT, 'GET /config': { ...CONFIG, authEmailEnabled: true } });
    renderHome();
    expect(await screen.findByRole('link', { name: 'Sign in with email' })).toHaveAttribute(
      'href',
      '/signin/email',
    );
  });

  it('sends a signed-in user to where they start', async () => {
    mockApi({
      'GET /config': CONFIG,
      'GET /me': makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] }),
    });
    renderHome();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/campaigns'));
  });
});

describe('the hero preview', () => {
  it('switches between what creators and brands see, as a preview only', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    const group = screen.getByRole('group', { name: 'Preview the app' });
    const creators = within(group).getByRole('button', { name: 'What creators see' });
    const brands = within(group).getByRole('button', { name: 'What brands see' });
    const stage = container.querySelector('.v3-stage')!;
    expect(creators).toHaveAttribute('aria-pressed', 'true');
    expect(stage).toHaveAttribute('data-view', 'creators');
    fireEvent.click(brands);
    expect(brands).toHaveAttribute('aria-pressed', 'true');
    expect(creators).toHaveAttribute('aria-pressed', 'false');
    expect(stage).toHaveAttribute('data-view', 'brands');
    // Nothing on the page asks the visitor to choose a side.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/(choose|select) (your|a) (role|side)/i);
  });

  it('shows the end of the story without motion: applied, picked, and 30% received', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    const stage = container.querySelector('.v3-stage')!;
    expect(stage).toHaveTextContent('Applied');
    expect(stage).toHaveTextContent('Picked');
    expect(stage).toHaveTextContent('30% received₹2,734.50');
    expect(screen.getByRole('img', { name: /a creator's open deals/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /a brand's posted deal/ })).toBeInTheDocument();
  });
});

describe('the pictures', () => {
  it('uses no image files, and only made-up @example handles', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    expect(container.querySelectorAll('img')).toHaveLength(0);
    const handles: string[] = [];
    for (const el of container.querySelectorAll('*')) {
      if ([...el.childNodes].some((n) => n.nodeType !== Node.TEXT_NODE)) continue;
      // A handle starts a word; an email address has its name before the "@".
      handles.push(...(el.textContent!.match(/(?<![\w.])@[a-z0-9._]+/gi) ?? []));
    }
    expect(handles.length).toBeGreaterThan(20);
    for (const h of handles) expect(h).toMatch(/^@example\./);
  });

  it('marks every screen and every band card as an example', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    for (const screenEl of container.querySelectorAll('.v3-phone, .v3-panel')) {
      expect(screenEl.getAttribute('aria-label')).toMatch(/^Example/);
      expect(screenEl).toHaveTextContent('Example');
    }
    for (const card of container.querySelectorAll('.v3-band-card')) {
      expect(card).toHaveTextContent('Example');
    }
  });

  it('closes the band loop with a copy hidden from assistive technology, and can pause it', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    const lists = container.querySelectorAll('.v3-band-list');
    expect(lists).toHaveLength(2);
    expect(lists[0]).not.toHaveAttribute('aria-hidden');
    expect(lists[1]).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.v3-band')).toHaveClass('is-paused');
  });
});

describe('How it works', () => {
  it('lists all nine steps for assistive technology, and names the current one', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    const steps = screen.getByRole('list', { name: 'The nine steps of a deal' });
    const items = within(steps)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toHaveLength(9);
    // At rest (no motion) the example deal is completed.
    expect(items[0]).toBe('Posted, done');
    expect(items[8]).toBe('Completed, current step');
    // The line shown under the bar on narrow screens.
    expect(container.querySelector('.v3-how .v3-step-now')).toHaveTextContent(
      'Step 9 of 9: Completed',
    );
  });
});

describe('the FAQ', () => {
  it('answers in native details that open with the keyboard', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    const faq = screen.getByRole('region', { name: 'Good questions' });
    const item = within(faq).getByText('What does it cost?').closest('details')!;
    expect(item.open).toBe(false);
    item.querySelector('summary')!.click();
    expect(item.open).toBe(true);
    expect(item).toHaveTextContent('₹885.00 per deal (₹750.00 + GST ₹135.00)');
    expect(faq).toHaveTextContent('What is the smallest deal?₹886.00.');
  });
});

describe('the deal calculator', () => {
  it('shows the worked example exactly as computeBreakdown does', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    expect(amountInput()).toHaveValue('10,000');
    expect(result()).toHaveTextContent('ValueSkins fee, 18% GST included₹885.00');
    expect(result()).toHaveTextContent('30% by UPI, before work starts₹2,734.50');
    expect(result()).toHaveTextContent('70% by UPI, after approval₹6,380.50');
    expect(result()).toHaveTextContent('The creator receives₹9,115.00');
    expect(
      screen.getByText('On a ₹10,000.00 deal, the creator receives ₹9,115.00.'),
    ).toHaveAttribute('role', 'status');
  });

  it('works out a new amount as it is typed, keeping only whole-rupee digits', async () => {
    mockApi(SIGNED_OUT);
    renderHome();
    fireEvent.change(amountInput(), { target: { value: '₹ 25,000.50abc' } });
    expect(amountInput()).toHaveValue('25,00,050');
    fireEvent.change(amountInput(), { target: { value: '25000' } });
    expect(amountInput()).toHaveValue('25,000');
    // 25,000.00 - 885.00 = 24,115.00; 30% = 7,234.50; 70% = 16,880.50.
    await waitFor(() => expect(result()).toHaveTextContent('The creator receives₹24,115.00'));
    expect(result()).toHaveTextContent('30% by UPI, before work starts₹7,234.50');
    expect(result()).toHaveTextContent('70% by UPI, after approval₹16,880.50');
    expect(window.location.search).toBe('?amount=25000');
  });

  it('takes the minimum from /config, and shows the fee below it', async () => {
    mockApi({ ...SIGNED_OUT, 'GET /config': { ...CONFIG, minBudgetPaise: 1_000_00 } });
    renderHome();
    fireEvent.change(amountInput(), { target: { value: '999' } });
    await screen.findByText('Whole rupees, ₹1,000.00 or more.');
    expect(result()).toHaveTextContent('Enter ₹1,000.00 or more.');
    expect(result()).toHaveTextContent('ValueSkins fee, every deal ₹885.00');
    fireEvent.change(amountInput(), { target: { value: '1000' } });
    await waitFor(() => expect(result()).toHaveTextContent('The creator receives₹115.00'));
  });

  it('stops at ₹885 and starts at ₹886, the shared minimum', async () => {
    mockApi(SIGNED_OUT);
    renderHome();
    fireEvent.change(amountInput(), { target: { value: '885' } });
    expect(result()).toHaveTextContent('Enter ₹886.00 or more.');
    fireEvent.change(amountInput(), { target: { value: '886' } });
    await waitFor(() => expect(result()).toHaveTextContent('The creator receives₹1.00'));
    expect(result()).toHaveTextContent('30% by UPI, before work starts₹0.30');
    expect(result()).toHaveTextContent('70% by UPI, after approval₹0.70');
  });

  it('caps very long amounts at eleven digits, still safe integers in paise', () => {
    expect(cleanDigits('1234567890123456789')).toBe('12345678901');
    const q = quote(cleanDigits('99999999999999'), CONFIG.minBudgetPaise, CONFIG.gstRateBps);
    expect(q.kind).toBe('ok');
    if (q.kind !== 'ok') return;
    expect(Number.isSafeInteger(q.breakdown.budgetPaise)).toBe(true);
    expect(q.breakdown.advancePaise + q.breakdown.finalPaise).toBe(q.breakdown.creatorAmountPaise);
  });

  it('reads ?amount= from the no-script form, and falls back to the worked example', () => {
    expect(initialDigits(undefined)).toBe('10000');
    expect(initialDigits('25,000')).toBe('25000');
    expect(initialDigits(['5000', '7000'])).toBe('5000');
    expect(initialDigits('')).toBe('');
  });

  it('works the figures out on the server, so they read without script', async () => {
    mockApi(SIGNED_OUT);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const element = await Page({ searchParams: Promise.resolve({ amount: '25000' }) });
    const html = renderToString(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    );
    const form = html.match(/<form[^>]*>/)![0];
    expect(form).toContain('action="/"');
    expect(form).toContain('method="get"');
    expect(html).toContain('value="25,000"');
    expect(html).toContain('₹24,115.00');
    expect(html).toContain('₹7,234.50');
    expect(html).toContain('₹16,880.50');
    expect(html).toContain('Work it out');
  });
});

describe('the count-up', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lands on the exact paise even when animation frames never run', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // A background tab: frames are requested and never delivered.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 500), {
      initialProps: { target: 273_450 },
    });
    expect(result.current).toBe(273_450);
    rerender({ target: 723_450 });
    expect(result.current).toBe(273_450);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current).toBe(723_450);
    expect(Number.isInteger(result.current)).toBe(true);
  });
});

describe('sign-in while the API wakes', () => {
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

  it('says why it is waiting, then offers "Try again" after 60 seconds', async () => {
    vi.useFakeTimers();
    mockApi({ 'GET /health': () => new Promise<Response>(() => {}) });
    render(<SignIn />);
    expect(screen.getByText(ACCOUNT_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(CONNECTING_REASON)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Sign in with Instagram' }));
    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Waking up ValueSkins. This can take up to a minute.',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.queryByText(CONNECTING_REASON)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'We could not reach ValueSkins. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('the footer', () => {
  it('links to every public page, the support address and the company', async () => {
    mockApi({
      ...SIGNED_OUT,
      'GET /config': { ...CONFIG, supportEmail: 'founder@valueskins.com' },
    });
    renderHome();
    const footer = screen.getByRole('navigation', { name: 'Footer' });
    expect(
      within(footer)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['How it works', '/how-it-works'],
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
      ['Refunds', '/refunds'],
      ['Contact', '/contact'],
    ]);
    expect(screen.getByRole('link', { name: 'founder@valueskins.com' })).toHaveAttribute(
      'href',
      'mailto:founder@valueskins.com',
    );
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Valueskins Private Limited`),
    ).toBeInTheDocument();
  });
});
