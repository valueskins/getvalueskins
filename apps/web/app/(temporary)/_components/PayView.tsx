'use client';

import {
  appConfigResponseSchema,
  dealDetailResponseSchema,
  formatInr,
  payAdvanceLabel,
  payCommissionLabel,
  payFinalLabel,
  paymentOrderResponseSchema,
  type DealDetail,
  type DealActionState,
  type PaymentOrderResponse,
  type PaymentTypeParam,
} from '@valueskins/shared';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../lib/temporary/api';
import { errorClass, headingClass, hintClass, primaryButton } from './styles';
import { useAction } from './useAction';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface CheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface CheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (response: CheckoutResponse) => void;
  modal: { ondismiss: () => void };
}

interface CheckoutInstance {
  open: () => void;
  on: (
    event: 'payment.failed',
    callback: (response: { error?: { description?: string } }) => void,
  ) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => CheckoutInstance;
  }
}

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Checkout did not load'));
    document.body.appendChild(script);
  });
}

type PayActionName = 'PAY_COMMISSION' | 'PAY_ADVANCE' | 'PAY_FINAL';

const PAY_TYPE: Record<PayActionName, PaymentTypeParam> = {
  PAY_COMMISSION: 'commission',
  PAY_ADVANCE: 'advance',
  PAY_FINAL: 'final',
};

function payLabel(action: PayActionName, deal: DealDetail): string {
  if (action === 'PAY_COMMISSION') return payCommissionLabel(deal.commissionTotalPaise ?? 0);
  if (action === 'PAY_ADVANCE') return payAdvanceLabel(deal.advancePaise ?? 0);
  return payFinalLabel(deal.finalPaise ?? 0);
}

function findPayAction(deal: DealDetail): (DealActionState & { action: PayActionName }) | null {
  const found = deal.allowedActions.find((a) => a.action in PAY_TYPE);
  return found ? (found as DealActionState & { action: PayActionName }) : null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; deal: DealDetail };

function Row({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between border-b border-line py-2">
      <dt className={hintClass}>{label}</dt>
      <dd>{value === null ? 'Not set' : formatInr(value)}</dd>
    </div>
  );
}

/**
 * Temporary payment page for the staging run (SPEC 7.3). Opens Razorpay Standard
 * Checkout for whichever payment is due and confirms it with /api/payments/verify.
 */
export function PayView() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [testMode, setTestMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<CheckoutResponse | null>(null);
  const pay = useAction();
  const confirm = useAction();

  const load = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/deals/${id}`);
      if (response.status === 401) return setState({ kind: 'signed-out' });
      if (!response.ok) {
        return setState({
          kind: 'error',
          message: await apiErrorMessage(response, 'Could not load this deal.'),
        });
      }
      const parsed = dealDetailResponseSchema.safeParse(await response.json());
      setState(
        parsed.success
          ? { kind: 'ready', deal: parsed.data.deal }
          : { kind: 'error', message: 'Could not read this deal.' },
      );
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server. Try again.' });
    }
  }, [id]);

  useEffect(() => {
    void load();
    apiFetch('/api/config')
      .then(async (response) => {
        const parsed = appConfigResponseSchema.safeParse(await response.json());
        if (parsed.success) setTestMode(parsed.data.razorpayKeyId.startsWith('rzp_test_'));
      })
      .catch(() => undefined);
  }, [load]);

  async function verify(response: CheckoutResponse): Promise<string | null> {
    const result = await apiFetch('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify(response),
    });
    if (!result.ok) {
      setUnconfirmed(response);
      return await apiErrorMessage(result, 'The payment could not be confirmed yet.');
    }
    setUnconfirmed(null);
    setNotice('Payment recorded.');
    await load();
    return null;
  }

  function startPayment(action: PayActionName, deal: DealDetail) {
    setNotice(null);
    void pay.run(async () => {
      const orderResponse = await apiFetch(
        `/api/deals/${deal.id}/payments/${PAY_TYPE[action]}/order`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      if (!orderResponse.ok) {
        return await apiErrorMessage(orderResponse, 'Could not start the payment.');
      }
      const order: PaymentOrderResponse = paymentOrderResponseSchema.parse(
        await orderResponse.json(),
      );

      await loadCheckout();
      if (!window.Razorpay) return 'Checkout did not load.';
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'ValueSkins',
        description: `${deal.title ?? 'Deal'} (${deal.shortId})`,
        handler: (response) => {
          void confirm.run(() => verify(response));
        },
        modal: { ondismiss: () => setNotice('Checkout closed. Nothing was charged.') },
      });
      checkout.on('payment.failed', (failure) =>
        setNotice(failure.error?.description ?? 'The payment failed. You can try again.'),
      );
      checkout.open();
      return null;
    });
  }

  if (state.kind === 'loading') return <p className={hintClass}>Loading</p>;
  if (state.kind === 'signed-out')
    return <p>You are signed out. Sign in, then open this page again.</p>;
  if (state.kind === 'error') return <p className={errorClass}>{state.message}</p>;

  const { deal } = state;
  const action = findPayAction(deal);

  return (
    <div className="space-y-6">
      <h1 className={headingClass}>{deal.title ?? 'Deal'}</h1>
      <p className={hintClass}>
        {deal.shortId} - {deal.status}
      </p>

      <dl>
        <Row label="Budget" value={deal.budgetPaise} />
        <Row label="Commission" value={deal.commissionTotalPaise} />
        <Row label="Creator amount" value={deal.creatorAmountPaise} />
        <Row label="Advance" value={deal.advancePaise} />
        <Row label="Final" value={deal.finalPaise} />
      </dl>

      {action ? (
        <div className="space-y-2">
          <button
            type="button"
            className={primaryButton}
            disabled={!action.enabled || pay.busy || confirm.busy}
            onClick={() => startPayment(action.action, deal)}
          >
            {payLabel(action.action, deal)}
          </button>
          {!action.enabled && action.reason ? <p className={hintClass}>{action.reason}</p> : null}
          {testMode ? (
            <p className={hintClass}>
              Razorpay test mode: use a Razorpay test card, no real money moves.
            </p>
          ) : null}
        </div>
      ) : (
        <p className={hintClass}>No payment is due on this deal.</p>
      )}

      {pay.error ? <p className={errorClass}>{pay.error}</p> : null}
      {confirm.error ? <p className={errorClass}>{confirm.error}</p> : null}
      {unconfirmed ? (
        <div className="space-y-2">
          <p className={hintClass}>
            Razorpay took the payment but we could not confirm it yet. Check again in a moment.
          </p>
          <button
            type="button"
            className={primaryButton}
            disabled={confirm.busy}
            onClick={() => void confirm.run(() => verify(unconfirmed))}
          >
            Check payment
          </button>
        </div>
      ) : null}
      {notice ? <p>{notice}</p> : null}
    </div>
  );
}
