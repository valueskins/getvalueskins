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
import {
  amountHint,
  cleanDigits,
  figureEm,
  initialDigits,
  quote,
} from '@/components/landing/amount';
import { Landing } from '@/components/landing/Landing';
import { useCountUp } from '@/components/landing/motion';
import { HomeSignIn } from '@/components/landing/HomeSignIn';
import { ACCOUNT_NOTE, CONNECTING_REASON } from '@/components/public/signInCopy';
import { resetWakeForTests } from '@/lib/wake';
import { apiError, mockApi } from './helpers/api';
import { CONFIG, makeMe } from './helpers/fixtures';
import { nav } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

// next/font only works inside a Next.js build; here the display cut is just a class name.
vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ variable: 'font-display-test', className: 'font-display-test' }),
}));

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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Paid deals, no haggling.');
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
    await screen.findByText('Whole rupees, ₹2,000.00 to ₹1,00,00,00,00,000.00.');
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

describe('the hero picture', () => {
  it('shows the end of the story without motion: picked, 70% received and on both profiles', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    const stage = container.querySelector('.hm-stage')!;
    expect(stage).toHaveAttribute('data-beat', '6');
    expect(stage).toHaveTextContent('Picked');
    expect(stage).toHaveTextContent('70% received by UPI₹6,380.50');
    // The 70% sits on solid lime; the 30%, earlier in the story, on the soft tint.
    expect(stage.querySelector('.hm-sat-amount')).toHaveAttribute('data-final', 'true');
    expect(stage).toHaveTextContent('Confirmed by the creator');
    expect(stage).toHaveTextContent('Completed. On both profiles.');
    // The ticket's parts are computeBreakdown's, for the example ₹10,000.00 deal.
    expect(stage).toHaveTextContent('Fee₹885.00');
    expect(stage).toHaveTextContent('30% by UPI₹2,734.50');
    expect(screen.getByRole('img', { name: /a brand's deal moving from posted/ })).toBe(stage);
    // Under reduced motion nothing plays, so there is nothing to pause.
    expect(screen.queryByRole('button', { name: /the example/ })).not.toBeInTheDocument();
  });

  it('asks nobody to choose a side', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/(choose|select) (your|a) (role|side)/i);
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
    expect(handles.length).toBeGreaterThan(8);
    for (const h of handles) expect(h).toMatch(/^@example\./);
  });

  it('marks every picture as an example, and keeps its insides out of the tab order', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    const pictures = container.querySelectorAll('[role="img"]');
    expect(pictures.length).toBe(4);
    for (const picture of pictures) {
      expect(picture.getAttribute('aria-label')).toMatch(/^Example/);
      expect(picture).toHaveTextContent('Example');
      expect(picture.querySelector('[inert]')).not.toBeNull();
    }
  });

  it('shows the brand picking and the creator applied, at rest', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    const brands = screen.getByRole('region', { name: 'Post once. Pick from who applies.' });
    expect(within(brands).getByRole('img')).toHaveTextContent(
      '@example.creator48,250 followers, 3.40%Picked',
    );
    const creators = screen.getByRole('region', { name: 'Every open deal. Apply for free.' });
    expect(within(creators).getByRole('img')).toHaveTextContent('Applied');
    expect(within(creators).getByRole('img')).toHaveTextContent('₹15,000.00');
  });
});

describe('the rules band', () => {
  it('closes its loop with a copy hidden from assistive technology, and can pause', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    const rules = screen.getByRole('region', { name: 'The rules of every deal' });
    const lists = rules.querySelectorAll('.hm-rules-list');
    expect(lists).toHaveLength(2);
    expect(lists[0]).not.toHaveAttribute('aria-hidden');
    expect(lists[1]).toHaveAttribute('aria-hidden', 'true');
    expect(
      within(rules)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toContain('The amount is final');
    fireEvent.click(within(rules).getByRole('button', { name: 'Pause' }));
    expect(within(rules).getByRole('button', { name: 'Play' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(container.querySelector('.hm-rules-band')).toHaveAttribute('data-paused', 'true');
  });
});

describe('How it works', () => {
  it('gives the seven steps one line each, with the fee, the UPI payments, Drive and the record', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    const how = screen.getByRole('region', { name: 'From posted to paid.' });
    const steps = within(how)
      .getAllByRole('heading', { level: 3 })
      .map((h) => [h.textContent, h.nextElementSibling?.textContent]);
    expect(steps).toEqual([
      ['Post the deal', 'The brand sets the work, the deadline and a final amount.'],
      ['Apply for free', 'Every creator sees every open deal and can apply.'],
      [
        'Pick one creator',
        'The brand pays ValueSkins ₹885.00 through Razorpay, with a GST invoice.',
      ],
      ['Pay 30% by UPI', 'Before work starts, paid directly to the creator, who confirms it.'],
      ['Share the content', 'The creator shares a Google Drive link, and the brand approves it.'],
      ['Pay 70% by UPI', 'After approval, paid directly to the creator, who confirms it.'],
      ['Keep the record', 'The deal goes on both profiles, with a record to download.'],
    ]);
  });

  it('shows the example deal completed beside the steps, with nothing following the scroll', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    // The fee paid and everything the creator was paid by UPI, on the example ₹10,000.00 deal.
    expect(container.querySelector('.hm-how-now')).toHaveTextContent(
      'Step 9 of 9CompletedFee to ValueSkins₹885.00Paid to the creator by UPI₹9,115.00',
    );
    // The card is a picture; the nine steps are listed for assistive technology instead.
    const nine = screen.getByRole('list', { name: 'The nine steps of a deal' });
    const items = within(nine)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toHaveLength(9);
    expect(items[0]).toBe('Posted, done');
    expect(items[8]).toBe('Completed, current step');
    // No step is singled out and no line sticks to the screen as the page scrolls.
    expect(container.querySelector('.hm-how [data-active]')).toBeNull();
    expect(container.querySelector('.hm-how .hm-step-now')).toBeNull();
  });

  it('puts the two UPI payments to the creator, and only those, on lime', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    const chips = [...container.querySelectorAll('.hm-how-n')].map((n) => [
      n.textContent,
      n.classList.contains('hm-how-n-upi'),
    ]);
    expect(chips).toEqual([
      ['1', false],
      ['2', false],
      ['3', false],
      ['4', true],
      ['5', false],
      ['6', true],
      ['7', false],
    ]);
  });
});

describe('the FAQ', () => {
  it('answers in native details that open with the keyboard', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    const faq = screen.getByRole('region', { name: 'Questions, answered.' });
    const item = within(faq).getByText('What does it cost?').closest('details')!;
    expect(item.open).toBe(false);
    item.querySelector('summary')!.click();
    expect(item.open).toBe(true);
    expect(item).toHaveTextContent('₹885.00 per deal (₹750.00 + GST ₹135.00)');
    expect(faq).toHaveTextContent('What is the smallest deal?₹2,000.00.');
  });
});

describe('the deal calculator', () => {
  it('shows the worked example exactly as computeBreakdown does', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    expect(amountInput()).toHaveValue('10,000');
    expect(result()).toHaveTextContent('Fee, GST included₹885.00');
    expect(result()).toHaveTextContent('30% by UPI, before work₹2,734.50');
    expect(result()).toHaveTextContent('70% by UPI, after approval₹6,380.50');
    expect(result()).toHaveTextContent('The creator receives₹9,115.00');
    expect(
      screen.getByText('On a ₹10,000.00 deal, the creator receives ₹9,115.00.'),
    ).toHaveAttribute('role', 'status');
  });

  it('says what it costs, and cuts the bar into the fee and the two UPI payments', () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome();
    const costs = screen.getByRole('region', { name: '₹885.00 a deal. Everything else is free.' });
    expect(costs).toHaveTextContent(
      'The brand pays ValueSkins ₹750.00 + 18% GST ₹135.00 per deal through Razorpay',
    );
    expect(
      within(costs)
        .getAllByRole('listitem')
        .slice(0, 3)
        .map((li) => li.textContent),
    ).toEqual(['Signing up is free', 'Browsing deals is free', 'Applying is free']);
    // ₹885.00 and ₹2,734.50 of ₹10,000.00: the fee, then the 30%; the 70% runs on to the end.
    const bar = container.querySelector<HTMLElement>('.hm-calc-bar')!;
    expect(bar.style.getPropertyValue('--fee')).toBe('8.850%');
    expect(bar.style.getPropertyValue('--advance')).toBe('27.345%');
    expect(bar.querySelectorAll('.hm-calc-seg')).toHaveLength(3);
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
    expect(result()).toHaveTextContent('30% by UPI, before work₹7,234.50');
    expect(result()).toHaveTextContent('70% by UPI, after approval₹16,880.50');
    expect(window.location.search).toBe('?amount=25000');
  });

  it('takes the minimum from /config, and shows the fee below it', async () => {
    mockApi({ ...SIGNED_OUT, 'GET /config': { ...CONFIG, minBudgetPaise: 3_000_00 } });
    renderHome();
    fireEvent.change(amountInput(), { target: { value: '2999' } });
    await screen.findByText('Whole rupees, ₹3,000.00 to ₹1,00,00,00,00,000.00.');
    expect(result()).toHaveTextContent('Enter ₹3,000.00 or more.');
    expect(result()).toHaveTextContent('ValueSkins fee, every deal ₹885.00');
    fireEvent.change(amountInput(), { target: { value: '3000' } });
    await waitFor(() => expect(result()).toHaveTextContent('The creator receives₹2,115.00'));
  });

  it('stops at ₹1,999 and starts at ₹2,000, the shared minimum', async () => {
    mockApi(SIGNED_OUT);
    renderHome();
    fireEvent.change(amountInput(), { target: { value: '1999' } });
    expect(result()).toHaveTextContent('Enter ₹2,000.00 or more.');
    fireEvent.change(amountInput(), { target: { value: '2000' } });
    await waitFor(() => expect(result()).toHaveTextContent('The creator receives₹1,115.00'));
    expect(result()).toHaveTextContent('30% by UPI, before work₹334.50');
    expect(result()).toHaveTextContent('70% by UPI, after approval₹780.50');
  });

  it('stops at the largest deal, MAX_BUDGET_RUPEES, however much is typed or pasted', async () => {
    mockApi(SIGNED_OUT);
    renderHome();
    fireEvent.change(amountInput(), { target: { value: '9'.repeat(30) } });
    expect(amountInput()).toHaveValue('1,00,00,00,00,000');
    expect(window.location.search).toBe('?amount=100000000000');
    expect(
      screen.getByText('Whole rupees, ₹2,000.00 to ₹1,00,00,00,00,000.00.'),
    ).toBeInTheDocument();
    // The full amounts, with paise, never shortened to lakh or crore.
    await waitFor(() =>
      expect(result()).toHaveTextContent('The creator receives₹99,99,99,99,115.00'),
    );
    expect(result()).toHaveTextContent('30% by UPI, before work₹29,99,99,99,734.50');
    expect(result()).toHaveTextContent('70% by UPI, after approval₹69,99,99,99,380.50');
  });

  it('clamps typed digits to the max, and keeps them safe integers in paise', () => {
    expect(cleanDigits('100000000000')).toBe('100000000000');
    expect(cleanDigits('100000000001')).toBe('100000000000');
    expect(cleanDigits('1'.repeat(40))).toBe('100000000000');
    expect(cleanDigits('₹ 1,00,00,000')).toBe('10000000');
    expect(cleanDigits('000123')).toBe('123');
    // Below the minimum is left alone while typing: the calculator says what the minimum is.
    expect(cleanDigits('5')).toBe('5');
    const q = quote(cleanDigits('9'.repeat(30)), CONFIG.minBudgetPaise, CONFIG.gstRateBps);
    expect(q.kind).toBe('ok');
    if (q.kind !== 'ok') return;
    expect(Number.isSafeInteger(q.breakdown.budgetPaise)).toBe(true);
    expect(q.breakdown.advancePaise + q.breakdown.finalPaise).toBe(q.breakdown.creatorAmountPaise);
  });

  it('reads ?amount=: whole rupees only, clamped to the range, else the worked example', () => {
    // What the no-script form sends, and what someone shares.
    expect(initialDigits('25000')).toBe('25000');
    expect(initialDigits('25,000')).toBe('25000');
    expect(initialDigits('₹ 1,00,000')).toBe('100000');
    expect(initialDigits(['5000', '7000'])).toBe('5000');
    // Not whole rupees: the worked example.
    for (const bad of [
      undefined,
      '',
      ' ',
      'abc',
      '12abc',
      '-5000',
      '1000.50',
      '1e6',
      '0',
      '0,00',
    ]) {
      expect(initialDigits(bad)).toBe('10000');
    }
    // Outside the range: clamped to it.
    expect(initialDigits('500')).toBe('2000');
    expect(initialDigits('1999')).toBe('2000');
    expect(initialDigits('2000')).toBe('2000');
    expect(initialDigits('100000000000')).toBe('100000000000');
    expect(initialDigits('999999999999999')).toBe('100000000000');
    expect(initialDigits('2999', 3_000_00)).toBe('3000');
  });

  it('says the range under the field, from the minimum to the largest deal', () => {
    expect(amountHint(CONFIG.minBudgetPaise)).toBe(
      'Whole rupees, ₹2,000.00 to ₹1,00,00,00,00,000.00.',
    );
    expect(amountHint(3_000_00)).toBe('Whole rupees, ₹3,000.00 to ₹1,00,00,00,00,000.00.');
    // Never under the shared minimum, whatever /config says.
    expect(amountHint(100)).toBe('Whole rupees, ₹2,000.00 to ₹1,00,00,00,00,000.00.');
  });

  it('sizes the figures to the longest amount, and keeps the fee in the bar on a large deal', async () => {
    mockApi(SIGNED_OUT);
    const { container } = renderHome('1000000');
    expect(result()).toHaveTextContent('Fee, GST included₹885.00');
    expect(result()).toHaveTextContent('30% by UPI, before work₹2,99,734.50');
    expect(result()).toHaveTextContent('70% by UPI, after approval₹6,99,380.50');
    expect(result()).toHaveTextContent('The creator receives₹9,99,115.00');
    const figures = container.querySelector<HTMLElement>('.hm-figures')!;
    expect(figures.style.getPropertyValue('--num-em')).toBe(String(figureEm('₹9,99,115.00')));
    expect(figureEm('₹99,99,99,99,115.00')).toBeGreaterThan(figureEm('₹9,99,115.00'));
    // ₹885.00 is under a tenth of a percent of ₹10,00,000.00; home.css gives it a minimum width.
    const bar = container.querySelector<HTMLElement>('.hm-calc-bar')!;
    expect(bar.style.getPropertyValue('--fee')).toBe('0.089%');
    expect(bar.style.getPropertyValue('--advance')).toBe('29.973%');
  });

  it('shows one focus ring, on the rounded box, and none on the input inside it', () => {
    mockApi(SIGNED_OUT);
    renderHome();
    // The box holds the ₹ prefix and the input, so it is marked as a prefixed field.
    const box = amountInput().parentElement!;
    expect(box).toHaveClass('hm-calc-input');
    expect(box).toHaveAttribute('data-affix');
    expect(box.querySelector('span')).toHaveAttribute('aria-hidden', 'true');
    // Its one ring is the box's; the CSS for that is checked in homeStyles.test.ts.
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

describe('the deal calculator without script', () => {
  it('clamps or falls back on a bad ?amount= on the server too', async () => {
    mockApi(SIGNED_OUT);
    const render = async (amount: string) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const element = await Page({ searchParams: Promise.resolve({ amount }) });
      return renderToString(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
    };
    expect(await render('9'.repeat(20))).toContain('value="1,00,00,00,00,000"');
    expect(await render('lots')).toContain('value="10,000"');
    expect(await render('100')).toContain('value="2,000"');
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
    render(<HomeSignIn />);
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
