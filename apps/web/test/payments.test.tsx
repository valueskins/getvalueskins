import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, json } from './helpers/api';
import { act, DEAL_ID, makeDeal, record } from './helpers/deals';
import { renderDeal } from './helpers/dealPage';

const qr = vi.hoisted(() => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,QR') }));
vi.mock('qrcode', () => ({ default: qr, toDataURL: qr.toDataURL }));

type Options = {
  key: string;
  order_id: string;
  amount: number;
  handler: (r: unknown) => void;
  modal: { ondismiss: () => void };
};

let checkout: { options: Options | null; behave: 'pay' | 'dismiss' | 'fail-then-dismiss' };

beforeEach(() => {
  checkout = { options: null, behave: 'pay' };
  class FakeRazorpay {
    private failed: ((r: unknown) => void) | null = null;
    constructor(public options: Options) {
      checkout.options = options;
    }
    on(_event: string, cb: (r: unknown) => void) {
      this.failed = cb;
    }
    open() {
      queueMicrotask(() => {
        if (checkout.behave === 'pay') {
          this.options.handler({
            razorpay_order_id: 'order_test_1',
            razorpay_payment_id: 'pay_test_1',
            razorpay_signature: 'sig_test',
          });
        } else {
          if (checkout.behave === 'fail-then-dismiss')
            this.failed?.({ error: { description: 'Card declined by bank XYZ' } });
          this.options.modal.ondismiss();
        }
      });
    }
  }
  (window as unknown as { Razorpay: unknown }).Razorpay = FakeRazorpay;
});

afterEach(() => {
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  qr.toDataURL.mockClear();
});

const confirmed = makeDeal('CONFIRMED', { allowedActions: [act('PAY_COMMISSION'), act('CANCEL')] });
const order = {
  orderId: 'order_test_1',
  amountPaise: 88500,
  currency: 'INR',
  keyId: 'rzp_test_fromorder',
  type: 'COMMISSION',
};

describe('the ValueSkins fee', () => {
  it('creates the order, opens Checkout with the order’s key, then verifies', async () => {
    const { api } = renderDeal(confirmed, 'brand', {
      [`POST /deals/${DEAL_ID}/payments/commission/order`]: json(200, order),
      'POST /payments/verify': json(200, {
        payment: { status: 'CAPTURED' },
        deal: makeDeal('COMMISSION_PAID'),
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pay ValueSkins fee: ₹885.00' }));
    expect(
      await screen.findByText('Your tax invoice is under Documents and in your email.'),
    ).toBeInTheDocument();
    expect(checkout.options).toMatchObject({
      key: 'rzp_test_fromorder',
      order_id: 'order_test_1',
      amount: 88500,
    });
    expect(api.called('POST /payments/verify')[0]!.body).toEqual({
      razorpay_order_id: 'order_test_1',
      razorpay_payment_id: 'pay_test_1',
      razorpay_signature: 'sig_test',
    });
  });

  it('says nothing was charged when Checkout is closed, without the provider’s words', async () => {
    checkout.behave = 'fail-then-dismiss';
    renderDeal(confirmed, 'brand', {
      [`POST /deals/${DEAL_ID}/payments/commission/order`]: json(200, order),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pay ValueSkins fee: ₹885.00' }));
    expect(await screen.findByText('The payment did not go through')).toBeInTheDocument();
    expect(screen.queryByText(/XYZ/)).not.toBeInTheDocument();
  });

  it('says Checkout closed when the brand closes it', async () => {
    checkout.behave = 'dismiss';
    const { api } = renderDeal(confirmed, 'brand', {
      [`POST /deals/${DEAL_ID}/payments/commission/order`]: json(200, order),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pay ValueSkins fee: ₹885.00' }));
    expect(await screen.findByText('Checkout closed')).toBeInTheDocument();
    expect(api.called('POST /payments/verify')).toHaveLength(0);
  });

  it('never invites a second payment when the money was taken but the deal has not moved', async () => {
    renderDeal(confirmed, 'brand', {
      [`POST /deals/${DEAL_ID}/payments/commission/order`]: json(200, order),
      'POST /payments/verify': json(200, { payment: { status: 'CAPTURED' }, deal: confirmed }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pay ValueSkins fee: ₹885.00' }));
    expect(await screen.findByText('Paid, but not confirmed yet')).toBeInTheDocument();
    expect(screen.getByText(/Do not pay twice/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay ValueSkins fee/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check payment' })).toBeInTheDocument();
  });

  it('says Razorpay is unreachable when the order cannot be made', async () => {
    renderDeal(confirmed, 'brand', {
      [`POST /deals/${DEAL_ID}/payments/commission/order`]: apiError(
        502,
        'RAZORPAY_UNAVAILABLE',
        'Razorpay is not reachable right now. Try again.',
      ),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pay ValueSkins fee: ₹885.00' }));
    expect(
      await screen.findByText('Razorpay is not reachable right now. Try again.'),
    ).toBeInTheDocument();
    expect(checkout.options).toBeNull();
  });
});

const info = {
  blocked: null,
  stage: 'ADVANCE',
  amountPaise: 273450,
  payee: { vpa: 'test.creator@okfakebank', name: 'Test Creator' },
  upi: {
    pa: 'test.creator@okfakebank',
    pn: 'Test Creator',
    am: '2734.50',
    cu: 'INR',
    tn: 'ValueSkins 8K2M4QXZ advance',
  },
  upiUri:
    'upi://pay?pa=test.creator%40okfakebank&pn=Test%20Creator&am=2734.50&cu=INR&tn=ValueSkins%208K2M4QXZ%20advance',
  record: null,
};

describe('the UPI pay panel', () => {
  const feePaid = makeDeal('COMMISSION_PAID', {
    allowedActions: [act('PAY_ADVANCE'), act('RAISE_DISPUTE')],
  });

  it('shows the full UPI ID only here, with the pay link and a QR drawn on demand', async () => {
    renderDeal(feePaid, 'brand', { [`GET /deals/${DEAL_ID}/direct-payment`]: info });
    expect(await screen.findByText('test.creator@okfakebank')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pay with UPI app' })).toHaveAttribute(
      'href',
      info.upiUri,
    );
    expect(
      await screen.findByRole('img', {
        name: 'UPI QR code for ₹2,734.50 to test.creator@okfakebank',
      }),
    ).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(qr.toDataURL).toHaveBeenCalledWith(info.upiUri, expect.any(Object));
  });

  it('does not load the QR library on other steps', async () => {
    renderDeal(makeDeal('ADVANCE_PAID', { allowedActions: [act('RAISE_DISPUTE')] }), 'brand');
    expect(
      await screen.findByRole('heading', {
        name: /Waiting for @test.creator to share the content/,
      }),
    ).toBeInTheDocument();
    expect(qr.toDataURL).not.toHaveBeenCalled();
  });

  it('checks the UPI reference, then records it for the stage due', async () => {
    const { api } = renderDeal(feePaid, 'brand', {
      [`GET /deals/${DEAL_ID}/direct-payment`]: info,
      [`POST /deals/${DEAL_ID}/direct-payment`]: json(201, { directPayment: record() }),
    });
    fireEvent.change(await screen.findByLabelText('UPI reference (UTR)'), {
      target: { value: '12$' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'I have paid' }));
    expect(
      screen.getByText(
        'Enter the UPI reference from your payment: 6 to 40 letters, digits, hyphens or slashes.',
      ),
    ).toBeInTheDocument();
    expect(api.called(`POST /deals/${DEAL_ID}/direct-payment`)).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('UPI reference (UTR)'), {
      target: { value: ' 412345678901 ' },
    });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Paid from HDFC' } });
    fireEvent.click(screen.getByRole('button', { name: 'I have paid' }));
    await waitFor(() =>
      expect(api.called(`POST /deals/${DEAL_ID}/direct-payment`)[0]!.body).toEqual({
        stage: 'ADVANCE',
        reference: '412345678901',
        note: 'Paid from HDFC',
      }),
    );
    expect(await screen.findByText('Payment recorded')).toBeInTheDocument();
  });

  it('says a second record from another tab was not saved', async () => {
    renderDeal(feePaid, 'brand', {
      [`GET /deals/${DEAL_ID}/direct-payment`]: info,
      [`POST /deals/${DEAL_ID}/direct-payment`]: apiError(
        409,
        'DIRECT_PAYMENT_ALREADY_RECORDED',
        'A payment is already recorded for this stage and is waiting for the creator to confirm',
      ),
    });
    fireEvent.change(await screen.findByLabelText('UPI reference (UTR)'), {
      target: { value: '412345678901' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'I have paid' }));
    expect(await screen.findByText('Your second entry was not saved.')).toBeInTheDocument();
  });

  it('explains a creator who has not agreed to share their UPI ID', async () => {
    renderDeal(
      makeDeal('COMMISSION_PAID', {
        allowedActions: [act('PAY_ADVANCE', 'The creator has not agreed to share their UPI ID')],
      }),
      'brand',
      {
        [`GET /deals/${DEAL_ID}/direct-payment`]: {
          ...info,
          blocked: 'no_consent',
          stage: null,
          amountPaise: null,
          payee: null,
          upi: null,
          upiUri: null,
        },
      },
    );
    expect(
      await screen.findAllByText('The creator has not agreed to share their UPI ID'),
    ).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Pay with UPI app' })).toBeDisabled();
    expect(screen.queryByText('test.creator@okfakebank')).not.toBeInTheDocument();
  });

  it('shows the creator’s reason and the struck record after "not received"', async () => {
    const disputed = record({
      status: 'DISPUTED',
      disputedAt: '2026-10-03T03:35:00.000Z',
      disputeReason: 'No credit in my account.',
    });
    renderDeal(
      makeDeal('COMMISSION_PAID', {
        directPayments: [disputed],
        allowedActions: [act('PAY_ADVANCE')],
      }),
      'brand',
      {
        [`GET /deals/${DEAL_ID}/direct-payment`]: info,
      },
    );
    expect(
      await screen.findByRole('heading', { name: 'Check the payment, then record it again' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        /The creator says the payment did not arrive: No credit in my account./,
      ),
    ).toBeInTheDocument();
    const nextStep = screen.getByRole('region', {
      name: 'Check the payment, then record it again',
    });
    expect(within(nextStep).getAllByText('Not received').length).toBeGreaterThan(0);
  });
});
