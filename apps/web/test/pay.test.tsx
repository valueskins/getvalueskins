import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PayPage from '../app/(temporary)/deals/[id]/pay/page';

const DEAL_ID = '01a0e8e8-52b5-75d3-999f-4570bcd490e4';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useParams: () => ({ id: DEAL_ID }),
}));

type Action = { action: string; enabled: boolean; reason: string | null };

function deal(
  overrides: { status?: string; allowedActions?: Action[]; directPayments?: unknown[] } = {},
) {
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
      directPayments: overrides.directPayments ?? [],
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

  describe('the advance and final are direct UPI payments', () => {
    const INFO = {
      blocked: null,
      stage: 'ADVANCE',
      amountPaise: 277_500,
      payee: { vpa: 'raj.kumar@okaxis', name: 'Raj Kumar' },
      upi: {
        pa: 'raj.kumar@okaxis',
        pn: 'Raj Kumar',
        am: '2775.00',
        cu: 'INR',
        tn: 'ValueSkins ABCD2345 advance',
      },
      upiUri:
        'upi://pay?pa=raj.kumar%40okaxis&pn=Raj%20Kumar&am=2775.00&cu=INR&tn=ValueSkins%20ABCD2345%20advance',
      record: null,
    };
    const PENDING = {
      id: 'dp1',
      stage: 'ADVANCE',
      amountPaise: 277_500,
      reference: 'UTR123456789',
      note: null,
      maskedVpa: 'ra\u2022\u2022\u2022@okaxis',
      recordedAt: '2026-10-09T04:30:00.000Z',
      confirmedAt: null,
      disputedAt: null,
      disputeReason: null,
      status: 'AWAITING_CONFIRMATION',
    };
    const payAdvance = (overrides: Partial<Action> = {}) => ({
      action: 'PAY_ADVANCE',
      enabled: true,
      reason: null,
      ...overrides,
    });

    it('shows the brand the payee, the amount, a UPI link and a QR code, then records the reference', async () => {
      const calls = mockApi({
        [`GET /api/deals/${DEAL_ID}`]: json(
          deal({ status: 'COMMISSION_PAID', allowedActions: [payAdvance()] }),
        ),
        [`GET /api/deals/${DEAL_ID}/direct-payment`]: json(INFO),
        [`POST /api/deals/${DEAL_ID}/direct-payment`]: json({ directPayment: { id: 'dp1' } }, 201),
        'GET /api/config': json(CONFIG),
      });
      render(<PayPage />);

      expect(await screen.findByText('Pay the advance by UPI: ₹2,775.00')).toBeInTheDocument();
      expect(screen.getByText('Raj Kumar')).toBeInTheDocument();
      expect(screen.getByText('raj.kumar@okaxis')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open in a UPI app' })).toHaveAttribute(
        'href',
        INFO.upiUri,
      );
      expect(screen.getByRole('img', { name: 'QR code for the UPI payment' }).innerHTML).toContain(
        '<svg',
      );
      expect(
        screen.getByText(/ValueSkins does not receive or hold this money/),
      ).toBeInTheDocument();

      const submit = screen.getByRole('button', { name: 'I have paid: record it' });
      expect(submit).toBeDisabled();
      fireEvent.change(screen.getByLabelText(/UPI reference/), { target: { value: 'short' } });
      expect(submit).toBeDisabled();
      expect(screen.getByText(/6 to 40 letters, digits, hyphens or slashes/)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/UPI reference/), {
        target: { value: ' 4312/AB-12 ' },
      });
      fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'paid at noon' } });
      fireEvent.click(submit);

      await waitFor(() =>
        expect(calls.some((c) => c.key === `POST /api/deals/${DEAL_ID}/direct-payment`)).toBe(true),
      );
      const post = calls.find((c) => c.key === `POST /api/deals/${DEAL_ID}/direct-payment`)!;
      // No amount is ever sent: the server uses the frozen one.
      expect(JSON.parse(String(post.init.body))).toEqual({
        stage: 'ADVANCE',
        reference: '4312/AB-12',
        note: 'paid at noon',
      });
    });

    it('says why nothing can be paid, and shows no UPI ID', async () => {
      mockApi({
        [`GET /api/deals/${DEAL_ID}`]: json(
          deal({
            status: 'COMMISSION_PAID',
            allowedActions: [
              payAdvance({ enabled: false, reason: 'The creator has not added a UPI ID yet' }),
            ],
          }),
        ),
        [`GET /api/deals/${DEAL_ID}/direct-payment`]: json({
          ...INFO,
          blocked: 'creator_has_no_upi',
          stage: null,
          amountPaise: null,
          payee: null,
          upi: null,
          upiUri: null,
        }),
        'GET /api/config': json(CONFIG),
      });
      render(<PayPage />);

      expect(await screen.findByText(/The creator has not added a UPI ID yet/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Open in a UPI app' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'I have paid: record it' }),
      ).not.toBeInTheDocument();
    });

    it('shows a recorded payment as waiting for the creator, with no form', async () => {
      mockApi({
        [`GET /api/deals/${DEAL_ID}`]: json(
          deal({
            status: 'COMMISSION_PAID',
            allowedActions: [
              payAdvance({
                enabled: false,
                reason: 'Waiting for the creator to confirm the payment you recorded',
              }),
            ],
          }),
        ),
        [`GET /api/deals/${DEAL_ID}/direct-payment`]: json({
          ...INFO,
          record: { ...PENDING, status: 'AWAITING_CONFIRMATION' },
        }),
        'GET /api/config': json(CONFIG),
      });
      render(<PayPage />);

      expect(
        await screen.findByText(/UPI reference UTR123456789\. Waiting for the creator/),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'I have paid: record it' }),
      ).not.toBeInTheDocument();
    });

    const confirmable = () =>
      deal({
        status: 'COMMISSION_PAID',
        allowedActions: [{ action: 'CONFIRM_PAYMENT_RECEIVED', enabled: true, reason: null }],
        directPayments: [PENDING],
      });

    it('lets the creator confirm that the money arrived', async () => {
      let current = confirmable();
      const calls = mockApi({
        [`GET /api/deals/${DEAL_ID}`]: () => json(current),
        'POST /api/direct-payments/dp1/confirm': () => {
          current = deal({ status: 'ADVANCE_PAID', allowedActions: [] });
          return json({ directPayment: { id: 'dp1' }, deal: current.deal });
        },
        'GET /api/config': json(CONFIG),
      });
      render(<PayPage />);

      expect(
        await screen.findByText('The brand says it paid the advance: ₹2,775.00'),
      ).toBeInTheDocument();
      expect(screen.getByText('UPI reference: UTR123456789')).toBeInTheDocument();
      // The creator sees the masked ID only.
      expect(screen.getByText(/Paid to ra\u2022\u2022\u2022@okaxis/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'I received it' }));

      expect(await screen.findByText('No payment is due on this deal.')).toBeInTheDocument();
      expect(calls.some((c) => c.key === 'POST /api/direct-payments/dp1/confirm')).toBe(true);
    });

    it('lets the creator say the money did not arrive, with a reason', async () => {
      const calls = mockApi({
        [`GET /api/deals/${DEAL_ID}`]: json(confirmable()),
        'POST /api/direct-payments/dp1/not-received': json({
          directPayment: { id: 'dp1' },
          deal: confirmable().deal,
        }),
        'GET /api/config': json(CONFIG),
      });
      render(<PayPage />);

      await screen.findByText('The brand says it paid the advance: ₹2,775.00');
      fireEvent.click(screen.getByRole('button', { name: 'Not received' }));
      const send = screen.getByRole('button', { name: 'Send: the money did not arrive' });
      expect(send).toBeDisabled();
      fireEvent.change(screen.getByLabelText('What happened?'), {
        target: { value: 'Nothing in my account' },
      });
      fireEvent.click(send);

      await waitFor(() =>
        expect(calls.some((c) => c.key === 'POST /api/direct-payments/dp1/not-received')).toBe(
          true,
        ),
      );
      const post = calls.find((c) => c.key === 'POST /api/direct-payments/dp1/not-received')!;
      expect(JSON.parse(String(post.init.body))).toEqual({ reason: 'Nothing in my account' });
    });

    it('tells the creator why there is nothing to confirm yet', async () => {
      mockApi({
        [`GET /api/deals/${DEAL_ID}`]: json(
          deal({
            status: 'COMMISSION_PAID',
            allowedActions: [
              {
                action: 'CONFIRM_PAYMENT_RECEIVED',
                enabled: false,
                reason: 'The brand has not recorded a payment yet',
              },
            ],
          }),
        ),
        'GET /api/config': json(CONFIG),
      });
      render(<PayPage />);
      expect(
        await screen.findByText('The brand has not recorded a payment yet'),
      ).toBeInTheDocument();
    });
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
