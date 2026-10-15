import { act as rtlAct, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DealMineItem } from '@valueskins/shared';
import { DEAL_DESCRIPTION_TEMPLATE } from '@valueskins/shared';
import { CampaignsPage } from '@/components/brand/CampaignsPage';
import { DealForm } from '@/components/brand/DealForm';
import { AUTOSAVE_MS } from '@/lib/draftStore';
import { apiError, json, mockApi } from './helpers/api';
import { BRAND, CREATOR, DEAL_ID, makeDeal } from './helpers/deals';
import { CONFIG } from './helpers/fixtures';
import { nav } from './helpers/nav';
import { meAs } from './helpers/dealPage';
import { renderWithProviders } from './helpers/render';

afterEach(() => {
  vi.useRealTimers();
  try {
    window.localStorage.clear();
  } catch {
    // jsdom has it.
  }
});

function item(status: DealMineItem['status'], over: Partial<DealMineItem> = {}): DealMineItem {
  const d = makeDeal(status);
  return {
    id: `${status}-id`,
    shortId: d.shortId,
    status,
    title: `${status} deal`,
    description: d.description,
    budgetPaise: d.budgetPaise,
    creatorAmountPaise: d.creatorAmountPaise,
    advancePaise: d.advancePaise,
    finalPaise: d.finalPaise,
    applicationDeadline: '2099-01-10',
    contentUploadDeadline: '2099-01-20',
    dealDeadline: '2099-01-25',
    publishedAt: d.publishedAt,
    createdAt: d.createdAt,
    brand: BRAND,
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
  };
}

describe('campaigns', () => {
  it('groups deals, filters them, and says what a draft still needs', async () => {
    mockApi({
      'GET /deals/mine': {
        items: [
          item('DRAFT', { title: 'My draft', budgetPaise: null }),
          item('OPEN', { applicantCount: 3, applicationsOpen: true }),
          item('COMMISSION_PAID', { yourTurn: true, nextStep: 'PAY_ADVANCE', creator: CREATOR }),
          item('COMPLETED', { completedAt: '2026-10-11T00:00:00Z', creator: CREATOR }),
          item('CANCELLED', { cancellationReason: 'Launch moved' }),
        ],
        nextCursor: null,
      },
    });
    renderWithProviders(<CampaignsPage />);
    expect(await screen.findByRole('heading', { name: /Drafts/ })).toBeInTheDocument();
    expect(screen.getByText('Add a budget')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      '/campaigns/DRAFT-id/edit',
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1 need you')).toBeInTheDocument();
    expect(screen.getByText('Pay the 30% advance by UPI')).toBeInTheDocument();
    expect(screen.getByText('Launch moved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Open/ }));
    expect(screen.queryByRole('heading', { name: /Drafts/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Open/ })).toBeInTheDocument();
  });

  it('deletes a draft after a confirm', async () => {
    const api = mockApi({
      'GET /deals/mine': { items: [item('DRAFT', { title: 'My draft' })], nextCursor: null },
      'DELETE /deals/DRAFT-id': json(200, { ok: true }),
    });
    renderWithProviders(<CampaignsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete My draft' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete draft' }),
    );
    await waitFor(() => expect(api.called('DELETE /deals/DRAFT-id')).toHaveLength(1));
  });

  it('shows the empty state', async () => {
    mockApi({ 'GET /deals/mine': { items: [], nextCursor: null } });
    renderWithProviders(<CampaignsPage />);
    expect(
      await screen.findByRole('heading', { name: 'You have not posted a deal yet' }),
    ).toBeInTheDocument();
  });
});

function renderForm(
  routes: Record<string, unknown> = {},
  draft = null as ReturnType<typeof makeDeal> | null,
) {
  const api = mockApi({ 'GET /me': meAs('brand'), 'GET /config': CONFIG, ...routes });
  const view = renderWithProviders(<DealForm draft={draft} />);
  return { api, ...view };
}

/** Puts dates the shared check accepts (all in the future, in order) straight into the form via its calendar. */
function pickDate(id: string, steps: number) {
  fireEvent.click(document.getElementById(id)!);
  const dialog = screen.getByRole('dialog', { name: /Pick the/ });
  for (let i = 0; i < steps; i += 1) fireEvent.keyDown(dialog, { key: 'ArrowDown' });
  fireEvent.click(document.activeElement as HTMLElement);
}

async function fillValid() {
  fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Test kurta reel' } });
  fireEvent.click(screen.getByRole('button', { name: 'Insert template' }));
  fireEvent.change(screen.getByLabelText('Budget in rupees'), { target: { value: '10000' } });
  pickDate('f-applicationDeadline', 1);
  pickDate('f-contentUploadDeadline', 2);
  pickDate('f-dealDeadline', 3);
}

describe('post a deal', () => {
  it('adds commas to the budget and shows the breakdown only from the minimum', async () => {
    renderForm();
    const budget = await screen.findByLabelText('Budget in rupees');
    fireEvent.change(budget, { target: { value: '4999' } });
    expect(budget).toHaveValue('4,999');
    expect(
      screen.getByText('Enter ₹5,000.00 or more to see what the creator gets and when.'),
    ).toBeInTheDocument();
    fireEvent.change(budget, { target: { value: '1000000' } });
    expect(budget).toHaveValue('10,00,000');
    const breakdown = screen.getByLabelText('Payment breakdown');
    expect(breakdown).toHaveTextContent('₹885.00');
    expect(breakdown).toHaveTextContent('Creators see: You receive ₹9,99,115.00');
  });

  it('inserts the deal template', async () => {
    renderForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Insert template' }));
    expect(screen.getByLabelText('Description')).toHaveValue(DEAL_DESCRIPTION_TEMPLATE);
  });

  it('checks the fields with the shared rules before publishing, with a summary of every problem', async () => {
    const { api } = renderForm();
    fireEvent.change(await screen.findByLabelText('Budget in rupees'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const summary = screen.getByRole('alert');
    expect(within(summary).getByRole('link', { name: 'Add a title' })).toHaveAttribute(
      'href',
      '#f-title',
    );
    expect(
      within(summary).getByRole('link', { name: 'The budget must be at least ₹5,000.00' }),
    ).toHaveAttribute('href', '#f-budget');
    expect(
      within(summary).getByRole('link', { name: 'Add a date for "Apply by"' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.calls.filter((c) => c.key.startsWith('POST'))).toHaveLength(0);
  });

  it('saves the draft, publishes from the confirm, and opens the deal', async () => {
    const created = makeDeal('DRAFT');
    const { api } = renderForm({
      'POST /deals': json(201, { deal: created }),
      [`POST /deals/${DEAL_ID}/publish`]: json(200, { deal: makeDeal('OPEN') }),
    });
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = screen.getByRole('dialog', { name: 'Publish Test kurta reel?' });
    expect(dialog).toHaveTextContent('You cannot edit a deal once it is published.');
    expect(dialog).toHaveTextContent('₹10,000.00');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/deals/${DEAL_ID}`));
    expect(api.called('POST /deals')[0]!.body).toMatchObject({
      title: 'Test kurta reel',
      budgetRupees: 10000,
      description: DEAL_DESCRIPTION_TEMPLATE,
    });
    expect(api.called(`POST /deals/${DEAL_ID}/publish`)).toHaveLength(1);
  });

  it('puts the server’s publish problems under the fields, and words the daily limit', async () => {
    const created = makeDeal('DRAFT');
    renderForm({
      'POST /deals': json(201, { deal: created }),
      [`POST /deals/${DEAL_ID}/publish`]: apiError(
        429,
        'PUBLISH_LIMIT',
        'You can publish up to 10 deals a day',
      ),
    });
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('You can publish up to 10 deals a day')).toBeInTheDocument();
  });

  it('keeps a copy on this device on blur and every 30 seconds, and offers it back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = renderForm();
    const title = await screen.findByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Draft on device' } });
    fireEvent.blur(title);
    expect(JSON.parse(window.localStorage.getItem('vs:deal-draft:new')!).fields.title).toBe(
      'Draft on device',
    );
    expect(
      screen.getByText(/Saved on this device at/, { selector: '[role="status"]' }),
    ).toBeInTheDocument();

    fireEvent.change(title, { target: { value: 'Draft on device, edited' } });
    rtlAct(() => vi.advanceTimersByTime(AUTOSAVE_MS + 10));
    expect(JSON.parse(window.localStorage.getItem('vs:deal-draft:new')!).fields.title).toBe(
      'Draft on device, edited',
    );
    first.unmount();

    renderForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore them' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Draft on device, edited');
  });

  it('says where to add billing details when publishing needs them', async () => {
    const draft = makeDeal('DRAFT');
    renderForm(
      {
        [`PATCH /deals/${DEAL_ID}`]: json(200, { deal: draft }),
        [`POST /deals/${DEAL_ID}/publish`]: apiError(
          409,
          'BILLING_REQUIRED',
          'Add billing details to publish',
        ),
      },
      draft,
    );
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('link', { name: 'Add billing details' })).toHaveAttribute(
      'href',
      '/settings#billing',
    );
  });
});
