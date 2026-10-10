import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PayPage from '../app/(temporary)/deals/[id]/pay/page';

const DEAL_ID = '01a0e8e8-52b5-75d3-999f-4570bcd490e4';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useParams: () => ({ id: DEAL_ID }),
}));

type Action = { action: string; enabled: boolean; reason: string | null };

function deal(overrides: { status?: string; allowedActions?: Action[] } = {}) {
  return {
    deal: {
      id: DEAL_ID,
      shortId: 'ABCD2345',
      status: overrides.status ?? 'CONFIRMED',
      title: 'Test deal',
      description: 'x',
      budgetPaise: 1_000_000,
      creatorAmountPaise: 925_000,
      applicationDeadline: '2026-10-12',
      contentUploadDeadline: '2026-10-20',
      dealDeadline: '2026-10-25',
      publishedAt: '2026-10-09T04:30:00.000Z',
      createdAt: '2026-10-09T04:00:00.000Z',
      brand: { id: 'b1', username: 'brand', profilePictureUrl: null },
      commissionBasePaise: 75_000,
      commissionGstPaise: 0,
      commissionTotalPaise: 75_000,
      advancePaise: 277_500,
      finalPaise: 647_500,
      confirmedAt: null,
      commissionPaidAt: null,
      advancePaidAt: null,
      approvedAt: null,
      completedAt: null,
      contentLink: null,
      contentUploadedAt: null,
      uploadCount: 0,
      revisionCount: 0,
      feedback: null,
      contentUploads: [],
      revisionNotice: null,
      cancelledAt: null,
      cancelledByRole: null,
      cancellationReason: null,
      creator: null,
      creatorPayoutSet: true,
      applicationCount: 1,
      applicationsOpen: false,
      contentOverdue: false,
      allowedActions: overrides.allowedActions ?? [
        { action: 'PAY_COMMISSION', enabled: true, reason: null },
        { action: 'CANCEL', enabled: true, reason: null },
      ],
    },
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Handler = (init: RequestInit) => Response | Promise<Response>;

function mockApi(routes: Record<string, Handler | Response>) {
  const calls: Array<{ key: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? 'GET'} ${new URL(url).pathname}`;
      calls.push({ key, init });
      const route = routes[key];
      if (!route) return new Response('{}', { status: 404 });
      return typeof route === 'function' ? route(init) : route.clone();
    }),
  );
  return calls;
}

const CONFIG = {
  gstRateBps: 0,
  minBudgetPaise: 500_000,
  advancePercent: 30,
  authEmailEnabled: true,
  razorpayKeyId: 'rzp_test_abc123',
};

interface FakeOptions {
  handler: (response: Record<string, string>) => void;
  order_id: string;
  key: string;
  amount: number;
}

function stubCheckout() {
  const opened: FakeOptions[] = [];
  const open = vi.fn();
  class FakeRazorpay {
    constructor(options: FakeOptions) {
      opened.push(options);
    }
    open = open;
    on = vi.fn();
  }
  vi.stubGlobal('Razorpay', FakeRazorpay);
  (window as unknown as { Razorpay: unknown }).Razorpay = FakeRazorpay;
  return { opened, open };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
});

describe('/deals/[id]/pay', () => {
  it('shows the breakdown and a pay button with the amount, then opens Checkout and confirms the payment', async () => {
    let current = deal();
    const calls = mockApi({
      [`GET /api/deals/${DEAL_ID}`]: () => json(current),
      'GET /api/config': json(CONFIG),
      [`POST /api/deals/${DEAL_ID}/payments/commission/order`]: json({
        orderId: 'order_1',
        amountPaise: 75_000,
        currency: 'INR',
        keyId: 'rzp_test_abc123',
        type: 'COMMISSION',
      }),
      'POST /api/payments/verify': () => {
        current = deal({ status: 'COMMISSION_PAID', allowedActions: [] });
        return json({ payment: { status: 'CAPTURED' }, deal: current.deal });
      },
    });
    const { opened, open } = stubCheckout();
    render(<PayPage />);

    expect(await screen.findByRole('heading', { name: 'Test deal' })).toBeInTheDocument();
    expect(screen.getByText('₹10,000.00')).toBeInTheDocument();
    expect(await screen.findByText(/Razorpay test mode/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pay commission: ₹750.00' }));

    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(opened[0]).toMatchObject({
      key: 'rzp_test_abc123',
      order_id: 'order_1',
      amount: 75_000,
    });

    opened[0]!.handler({
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig',
    });

    await screen.findByText('Payment recorded.');
    const verify = calls.find((c) => c.key === 'POST /api/payments/verify')!;
    expect(JSON.parse(String(verify.init.body))).toEqual({
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig',
    });
    expect(await screen.findByText('No payment is due on this deal.')).toBeInTheDocument();
  });

  it('disables the button and says why when the payment cannot be made yet', async () => {
    mockApi({
      [`GET /api/deals/${DEAL_ID}`]: json(
        deal({
          status: 'COMMISSION_PAID',
          allowedActions: [
            {
              action: 'PAY_ADVANCE',
              enabled: false,
              reason: 'Paying the creator directly is not available yet',
            },
          ],
        }),
      ),
      'GET /api/config': json(CONFIG),
    });
    render(<PayPage />);

    const button = await screen.findByRole('button', { name: 'Pay advance: ₹2,775.00' });
    expect(button).toBeDisabled();
    expect(
      screen.getByText('Paying the creator directly is not available yet'),
    ).toBeInTheDocument();
  });

  it('offers to check again when Razorpay took the payment but confirming failed', async () => {
    let verifyCalls = 0;
    mockApi({
      [`GET /api/deals/${DEAL_ID}`]: json(deal()),
      'GET /api/config': json(CONFIG),
      [`POST /api/deals/${DEAL_ID}/payments/commission/order`]: json({
        orderId: 'order_1',
        amountPaise: 75_000,
        currency: 'INR',
        keyId: 'rzp_test_abc123',
        type: 'COMMISSION',
      }),
      'POST /api/payments/verify': () => {
        verifyCalls += 1;
        return verifyCalls === 1
          ? json(
              {
                error: {
                  code: 'RAZORPAY_UNAVAILABLE',
                  message: 'Razorpay is not reachable right now. Try again.',
                },
              },
              502,
            )
          : json({
              payment: { status: 'CAPTURED' },
              deal: deal({ status: 'COMMISSION_PAID', allowedActions: [] }).deal,
            });
      },
    });
    const { opened, open } = stubCheckout();
    render(<PayPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pay commission: ₹750.00' }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    opened[0]!.handler({
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 's',
    });

    expect(
      await screen.findByText('Razorpay is not reachable right now. Try again.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check payment' }));
    await screen.findByText('Payment recorded.');
    expect(verifyCalls).toBe(2);
  });

  it('shows the signed-out state on a 401', async () => {
    mockApi({
      [`GET /api/deals/${DEAL_ID}`]: json({ error: {} }, 401),
      'GET /api/config': json(CONFIG),
    });
    render(<PayPage />);
    expect(await screen.findByText(/You are signed out/)).toBeInTheDocument();
  });
});
