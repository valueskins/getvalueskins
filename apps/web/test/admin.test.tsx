import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ADMIN_CANCEL_WINDOW } from '@valueskins/shared';
import AdminLayout from '@/app/(admin)/admin/layout';
import { AdminDealPage } from '@/components/admin/AdminDealPage';
import { AdminDealsPage, cleanShortId } from '@/components/admin/AdminDealsPage';
import { AdminDisputePage } from '@/components/admin/AdminDisputePage';
import { AdminDisputesPage } from '@/components/admin/AdminDisputesPage';
import { cancelBlockedReason } from '@/components/admin/AdminCancelModal';
import type {
  AdminDealDetail,
  AdminDealItem,
  AdminDispute,
  AdminEmail,
  AdminPayment,
} from '@/lib/api/admin';
import { apiError, json, mockApi } from './helpers/api';
import { BRAND, CREATOR, DEAL_ID, makeDeal, record } from './helpers/deals';
import { makeMe } from './helpers/fixtures';
import { nav, setSearch } from './helpers/nav';
import { renderWithProviders } from './helpers/render';

const admin = makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'], isAdmin: true });
const brand = makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] });
const DISPUTE_ID = '0190a0e8-52b5-75d3-999f-4570bcd49300';

function item(over: Partial<AdminDealItem> = {}): AdminDealItem {
  const d = makeDeal('ADVANCE_PAID');
  return {
    id: d.id,
    shortId: d.shortId,
    status: d.status,
    title: d.title,
    description: d.description,
    budgetPaise: d.budgetPaise,
    creatorAmountPaise: d.creatorAmountPaise,
    advancePaise: d.advancePaise,
    finalPaise: d.finalPaise,
    applicationDeadline: d.applicationDeadline,
    contentUploadDeadline: d.contentUploadDeadline,
    dealDeadline: d.dealDeadline,
    publishedAt: d.publishedAt,
    createdAt: d.createdAt,
    brand: BRAND,
    creator: CREATOR,
    hasOpenDispute: false,
    awaitingConfirmation: false,
    contentOverdue: false,
    updatedAt: d.createdAt,
    ...over,
  };
}

function dispute(over: Partial<AdminDispute> = {}): AdminDispute {
  return {
    id: DISPUTE_ID,
    dealId: DEAL_ID,
    dealShortId: '8K2M4QXZ',
    dealTitle: 'Test kurta reel',
    subject: 'Cannot shoot before the deadline',
    description: 'A family matter. I have not started the shoot.',
    status: 'OPEN',
    raisedBy: { id: CREATOR.id, username: CREATOR.username, role: 'CREATOR' },
    resolution: null,
    refundReference: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: '2026-10-05T13:00:00.000Z',
    ...over,
  };
}

function email(over: Partial<AdminEmail> = {}): AdminEmail {
  return {
    id: '0190a0e8-52b5-75d3-999f-4570bcd49400',
    template: 'commissionPaidBrand',
    subject: 'ValueSkins fee paid: Test kurta reel',
    bodyText: 'Your fee is paid. The tax invoice is attached.',
    toEmail: 'brand@example.test',
    cc: [],
    status: 'SENT',
    error: null,
    attachmentNames: ['VS-2026-27-000123.pdf'],
    createdAt: '2026-10-02T06:04:00.000Z',
    sentAt: '2026-10-02T06:04:05.000Z',
    ...over,
  };
}

const PAYMENT: AdminPayment = {
  id: '0190a0e8-52b5-75d3-999f-4570bcd49500',
  type: 'COMMISSION',
  status: 'CAPTURED',
  amountPaise: 88_500,
  razorpayOrderId: 'order_TESTORDER01',
  razorpayPaymentId: 'pay_TESTPAY01',
  failureReason: null,
  capturedAt: '2026-10-02T06:04:00.000Z',
  razorpayFeePaise: 1770,
  razorpayTaxPaise: 319,
  invoiceNumber: 'VS/2026-27/000123',
  createdAt: '2026-10-02T06:00:00.000Z',
};

function detail(over: Partial<AdminDealDetail> = {}): AdminDealDetail {
  return {
    deal: makeDeal('ADVANCE_PAID', {
      directPayments: [record({ status: 'CONFIRMED', confirmedAt: '2026-10-03T08:45:00.000Z' })],
    }),
    events: [],
    payments: [PAYMENT],
    directPayments: [record({ status: 'CONFIRMED', confirmedAt: '2026-10-03T08:45:00.000Z' })],
    emails: [email()],
    disputes: [dispute()],
    ...over,
  };
}

function urlsOf(fetchMock: { mock: { calls: unknown[][] } }, path: string): URL[] {
  return fetchMock.mock.calls
    .map((c) => new URL(String(c[0]), 'http://localhost'))
    .filter((u) => u.pathname === `/api${path}`);
}

describe('admin access', () => {
  it('shows the admin shell to an admin', async () => {
    nav.pathname = '/admin/deals';
    mockApi({ 'GET /me': admin, 'GET /admin/deals': { items: [], nextCursor: null, total: 0 } });
    renderWithProviders(
      <AdminLayout>
        <p>admin body</p>
      </AdminLayout>,
    );
    expect(await screen.findByText('admin body')).toBeInTheDocument();
    const navs = screen.getAllByRole('navigation', { name: 'Admin' });
    expect(
      within(navs[0]!)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Deals', 'Disputes']);
    expect(screen.getAllByText('Admin', { selector: '.admin-tag' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Post a deal/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /@test\.brand/ }));
    const menu = screen.getByRole('menu', { name: 'Account' });
    expect(within(menu).getByText('Admin')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('gives a non-admin and a signed-out visitor the 404 page', async () => {
    mockApi({ 'GET /me': brand });
    const first = renderWithProviders(
      <AdminLayout>
        <p>admin body</p>
      </AdminLayout>,
    );
    expect(await screen.findByText('404 page')).toBeInTheDocument();
    first.unmount();

    mockApi({ 'GET /me': apiError(401, 'UNAUTHENTICATED') });
    renderWithProviders(
      <AdminLayout>
        <p>admin body</p>
      </AdminLayout>,
    );
    expect(await screen.findByText('404 page')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.queryByText('admin body')).not.toBeInTheDocument();
  });
});

describe('admin deals list', () => {
  it('shows the rows with their marks', async () => {
    mockApi({
      'GET /admin/deals': {
        items: [
          item({ hasOpenDispute: true, contentOverdue: true }),
          item({
            id: 'other',
            shortId: 'W2SH7BYN',
            status: 'DRAFT',
            title: null,
            creator: null,
            budgetPaise: null,
            awaitingConfirmation: true,
          }),
        ],
        nextCursor: null,
        total: 2,
      },
    });
    renderWithProviders(<AdminDealsPage />);
    const link = await screen.findByRole('link', { name: 'Test kurta reel' });
    expect(link).toHaveAttribute('href', `/admin/deals/${DEAL_ID}`);
    expect(screen.getByText('Open dispute')).toBeInTheDocument();
    expect(screen.getByText('Content overdue')).toBeInTheDocument();
    expect(screen.getByText('Waiting for creator')).toBeInTheDocument();
    expect(screen.getByText('Not confirmed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Untitled draft' })).toBeInTheDocument();
    expect(screen.getByText('₹10,000.00')).toBeInTheDocument();
    expect(screen.getByText('Page 1. 2 deals on this page, 2 in all.')).toBeInTheDocument();
  });

  it('sends the status and short id from the address, and updates the address', async () => {
    setSearch('status=OPEN&q=8k2');
    const api = mockApi({ 'GET /admin/deals': { items: [], nextCursor: null, total: 0 } });
    renderWithProviders(<AdminDealsPage />);
    expect(await screen.findByText('No deals start with 8K2')).toBeInTheDocument();
    const url = urlsOf(api.fetchMock, '/admin/deals')[0]!;
    expect(url.searchParams.get('status')).toBe('OPEN');
    expect(url.searchParams.get('q')).toBe('8K2');

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'COMPLETED' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/admin/deals?status=COMPLETED&q=8K2');

    fireEvent.change(screen.getByLabelText('Short id'), { target: { value: '8k2m-4' } });
    await waitFor(() =>
      expect(nav.replace).toHaveBeenLastCalledWith('/admin/deals?status=OPEN&q=8K2M4'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/admin/deals');
  });

  it('pages forward and back with the cursor', async () => {
    let n = 0;
    const api = mockApi({
      'GET /admin/deals': () => {
        n += 1;
        return json(200, {
          items: [item({ id: `d${n}`, title: `Deal page ${n}` })],
          nextCursor: n === 1 ? 'CURSOR2' : null,
          total: 2,
        });
      },
    });
    renderWithProviders(<AdminDealsPage />);
    await screen.findByText('Deal page 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Deal page 2')).toBeInTheDocument();
    expect(screen.getByText('No more deals')).toBeInTheDocument();
    expect(urlsOf(api.fetchMock, '/admin/deals')[1]!.searchParams.get('cursor')).toBe('CURSOR2');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Page 1. 1 deal on this page, 2 in all.')).toBeInTheDocument();
  });

  it('says when a status has no deals, and offers to try again on an error', async () => {
    setSearch('status=APPROVED');
    mockApi({ 'GET /admin/deals': { items: [], nextCursor: null, total: 0 } });
    const first = renderWithProviders(<AdminDealsPage />);
    expect(await screen.findByText('No deals with this status')).toBeInTheDocument();
    first.unmount();

    setSearch('');
    mockApi({ 'GET /admin/deals': apiError(500, 'INTERNAL', 'Something went wrong') });
    renderWithProviders(<AdminDealsPage />);
    expect(await screen.findByText('We could not load the deals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('keeps only letters and digits in a short id', () => {
    expect(cleanShortId(' 8k2m-4qxz9 ')).toBe('8K2M4QXZ');
  });
});

describe('admin deal page', () => {
  it('shows the disputes, the fee, the masked UPI records, the emails and the amounts', async () => {
    mockApi({ [`GET /admin/deals/${DEAL_ID}`]: detail() });
    renderWithProviders(<AdminDealPage id={DEAL_ID} />);
    expect(await screen.findByRole('heading', { name: 'Test kurta reel' })).toBeInTheDocument();
    expect(screen.getAllByText('Open dispute').length).toBeGreaterThan(0);
    expect(screen.getByText('Cannot shoot before the deadline')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open dispute' })).toHaveAttribute(
      'href',
      `/admin/disputes/${DISPUTE_ID}`,
    );
    expect(screen.getByText('Captured', { selector: '.badge' })).toBeInTheDocument();
    expect(screen.getByText('order_TESTORDER01')).toBeInTheDocument();
    expect(screen.getByText('VS/2026-27/000123')).toBeInTheDocument();
    expect(screen.getAllByText('te•••@okfakebank').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/test@okfakebank/);
    expect(screen.getByText('brand@example.test')).toBeInTheDocument();
    expect(screen.getByText('What the brand pays in total')).toBeInTheDocument();
    expect(screen.getByText(/Admin view\./)).toBeInTheDocument();
  });

  it('opens an email body and resends it, naming what could not be attached', async () => {
    const api = mockApi({
      [`GET /admin/deals/${DEAL_ID}`]: detail(),
      [`POST /admin/emails/${email().id}/resend`]: {
        emailLogId: 'new',
        status: 'SENT',
        missingAttachments: ['VS-2026-27-000123.pdf'],
      },
    });
    renderWithProviders(<AdminDealPage id={DEAL_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /^ValueSkins fee paid: Test/ }));
    expect(screen.getByText('Your fee is paid. The tax invoice is attached.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Resend/ }));
    expect(await screen.findByText('Email sent again')).toBeInTheDocument();
    expect(
      screen.getByText('To brand@example.test. Left off: VS-2026-27-000123.pdf.'),
    ).toBeInTheDocument();
    expect(api.called(`POST /admin/emails/${email().id}/resend`)).toHaveLength(1);
  });

  it('cancels with a required note and an optional refund reference', async () => {
    const api = mockApi({
      [`GET /admin/deals/${DEAL_ID}`]: detail(),
      [`POST /admin/deals/${DEAL_ID}/cancel`]: { deal: makeDeal('CANCELLED') },
    });
    renderWithProviders(<AdminDealPage id={DEAL_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel deal' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/The ValueSkins fee of/)).toHaveTextContent('₹885.00');
    expect(within(dialog).getByText(/advance went directly to @test\.creator/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel deal' }));
    expect(await within(dialog).findByText('Add a note. Both sides see it.')).toBeInTheDocument();
    expect(api.called(`POST /admin/deals/${DEAL_ID}/cancel`)).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Note'), {
      target: { value: ' Both sides agreed to stop. ' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Refund reference/), {
      target: { value: 'rfnd_TEST1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel deal' }));
    expect(await screen.findByText('Deal cancelled')).toBeInTheDocument();
    expect(api.called(`POST /admin/deals/${DEAL_ID}/cancel`)[0]!.body).toEqual({
      note: 'Both sides agreed to stop.',
      refundReference: 'rfnd_TEST1',
    });
  });

  it('shows a lost race in plain words', async () => {
    mockApi({
      [`GET /admin/deals/${DEAL_ID}`]: detail(),
      [`POST /admin/deals/${DEAL_ID}/cancel`]: apiError(
        409,
        'INVALID_TRANSITION',
        ADMIN_CANCEL_WINDOW,
      ),
    });
    renderWithProviders(<AdminDealPage id={DEAL_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel deal' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'Stop it' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel deal' }));
    expect(await screen.findByText('This deal just changed')).toBeInTheDocument();
  });

  it('disables Cancel outside the admin window, with the reason', async () => {
    mockApi({
      [`GET /admin/deals/${DEAL_ID}`]: detail({ deal: makeDeal('CANCELLED'), disputes: [] }),
    });
    renderWithProviders(<AdminDealPage id={DEAL_ID} />);
    const button = await screen.findByRole('button', { name: 'Cancel deal' });
    expect(button).toBeDisabled();
    expect(screen.getByText('This deal is already cancelled')).toBeInTheDocument();
  });

  it('knows the admin cancel window from the shared transition table', () => {
    for (const s of ['COMMISSION_PAID', 'ADVANCE_PAID', 'CONTENT_UPLOADED', 'APPROVED'] as const) {
      expect(cancelBlockedReason(s)).toBeNull();
    }
    expect(cancelBlockedReason('OPEN')).toBe(ADMIN_CANCEL_WINDOW);
    expect(cancelBlockedReason('COMPLETED')).toBe(ADMIN_CANCEL_WINDOW);
    expect(cancelBlockedReason('CANCELLED')).toBe('This deal is already cancelled');
  });

  it('shows the 404 page for an unknown deal', async () => {
    mockApi({ [`GET /admin/deals/${DEAL_ID}`]: apiError(404, 'NOT_FOUND') });
    renderWithProviders(<AdminDealPage id={DEAL_ID} />);
    expect(await screen.findByText('404 page')).toBeInTheDocument();
  });
});

describe('admin disputes', () => {
  it('lists open disputes, and switches to resolved', async () => {
    const api = mockApi({
      'GET /admin/disputes': { items: [dispute()], nextCursor: null },
    });
    renderWithProviders(<AdminDisputesPage />);
    expect(
      await screen.findByRole('link', { name: 'Cannot shoot before the deadline' }),
    ).toHaveAttribute('href', `/admin/disputes/${DISPUTE_ID}`);
    expect(screen.getByText('@test.creator')).toBeInTheDocument();
    expect(urlsOf(api.fetchMock, '/admin/disputes')[0]!.searchParams.get('status')).toBe('OPEN');
    fireEvent.click(screen.getByRole('tab', { name: 'Resolved' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/admin/disputes?status=RESOLVED');
  });

  it('says when a tab is empty', async () => {
    setSearch('status=RESOLVED');
    const api = mockApi({ 'GET /admin/disputes': { items: [], nextCursor: null } });
    renderWithProviders(<AdminDisputesPage />);
    expect(await screen.findByText('No resolved disputes yet')).toBeInTheDocument();
    expect(urlsOf(api.fetchMock, '/admin/disputes')[0]!.searchParams.get('status')).toBe(
      'RESOLVED',
    );
  });

  it('marks a dispute resolved with a required resolution', async () => {
    const api = mockApi({
      [`GET /admin/disputes/${DISPUTE_ID}`]: { dispute: dispute() },
      [`GET /admin/deals/${DEAL_ID}`]: detail(),
      [`POST /admin/disputes/${DISPUTE_ID}/resolve`]: {
        dispute: dispute({ status: 'RESOLVED', resolution: 'Both agreed.' }),
      },
    });
    renderWithProviders(<AdminDisputePage id={DISPUTE_ID} />);
    expect(
      await screen.findByText('A family matter. I have not started the shoot.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Open the deal' })).toHaveAttribute(
      'href',
      `/admin/deals/${DEAL_ID}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    expect(
      await screen.findByText('Write the resolution. Both sides will read it.'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Resolution'), { target: { value: 'Both agreed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    expect(await screen.findByText('Dispute resolved')).toBeInTheDocument();
    expect(api.called(`POST /admin/disputes/${DISPUTE_ID}/resolve`)[0]!.body).toEqual({
      resolution: 'Both agreed.',
    });
  });

  it('shows a resolved dispute with the disabled reason', async () => {
    mockApi({
      [`GET /admin/disputes/${DISPUTE_ID}`]: {
        dispute: dispute({
          status: 'RESOLVED',
          resolution: 'The brand paid again and the creator confirmed it.',
          refundReference: 'rfnd_TEST2',
          resolvedBy: { id: 'a', username: 'test.admin' },
          resolvedAt: '2026-10-06T10:35:00.000Z',
        }),
      },
      [`GET /admin/deals/${DEAL_ID}`]: detail(),
    });
    renderWithProviders(<AdminDisputePage id={DISPUTE_ID} />);
    expect(
      await screen.findByText('The brand paid again and the creator confirmed it.'),
    ).toBeInTheDocument();
    expect(screen.getByText('rfnd_TEST2')).toBeInTheDocument();
    expect(screen.getByText('@test.admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark resolved' })).toBeDisabled();
    expect(screen.getByText('This dispute is already resolved')).toBeInTheDocument();
  });

  it('re-reads a dispute someone else resolved first', async () => {
    let reads = 0;
    mockApi({
      [`GET /admin/disputes/${DISPUTE_ID}`]: () => {
        reads += 1;
        return json(200, {
          dispute:
            reads === 1
              ? dispute()
              : dispute({ status: 'RESOLVED', resolution: 'Settled by another admin.' }),
        });
      },
      [`GET /admin/deals/${DEAL_ID}`]: detail(),
      [`POST /admin/disputes/${DISPUTE_ID}/resolve`]: apiError(
        409,
        'DISPUTE_ALREADY_RESOLVED',
        'This dispute is already resolved',
      ),
    });
    renderWithProviders(<AdminDisputePage id={DISPUTE_ID} />);
    fireEvent.change(await screen.findByLabelText('Resolution'), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    expect(await screen.findByText('This dispute was already resolved')).toBeInTheDocument();
    expect(await screen.findByText('Settled by another admin.')).toBeInTheDocument();
  });
});
