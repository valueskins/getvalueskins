'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatInr, payFeeLabel, type DealDetail } from '@valueskins/shared';
import { refreshDeal, useCreateFeeOrder, useVerifyPayment } from '@/lib/api/deals';
import { isApiError } from '@/lib/api/errors';
import { useMe } from '@/lib/api/queries';
import { dealErrorText } from '@/lib/dealErrors';
import { actionOf, reasonOf } from '@/lib/dealView';
import { loadCheckout, openCheckout } from '@/lib/razorpay';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useToast } from '@/components/ui/Toast';
import { useRealtime } from '@/components/realtime/RealtimeProvider';

type Phase = 'idle' | 'opening' | 'confirming' | 'unconfirmed';

/**
 * Payment 1, the ValueSkins fee, through Razorpay Checkout (SPEC 7.3): create
 * the order, open Checkout with the order's key, then verify. The webhook may
 * move the deal first; either way the page goes by the deal's status.
 */
export function FeePanel({ deal }: { deal: DealDetail }) {
  const action = actionOf(deal, 'PAY_COMMISSION');
  const order = useCreateFeeOrder(deal.id);
  const verify = useVerifyPayment();
  const client = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const { noteOwnAction } = useRealtime();
  const [phase, setPhase] = useState<Phase>('idle');

  if (!action || deal.commissionTotalPaise === null) return null;
  const total = deal.commissionTotalPaise;

  const fail = (err: unknown) => {
    const e = dealErrorText(err);
    toast.show({ tone: 'error', title: e.title, text: e.text });
  };

  async function pay() {
    setPhase('opening');
    noteOwnAction(deal.id);
    let created;
    try {
      created = await order.mutateAsync();
    } catch (err) {
      fail(err);
      setPhase('idle');
      return;
    }
    try {
      await loadCheckout();
    } catch {
      toast.show({
        tone: 'error',
        title: 'Razorpay is not reachable right now. Try again.',
        text: 'Nothing was charged.',
      });
      setPhase('idle');
      return;
    }
    const outcome = await openCheckout({
      keyId: created.keyId,
      orderId: created.orderId,
      amountPaise: created.amountPaise,
      currency: created.currency,
      description: `ValueSkins fee, deal ${deal.shortId}`,
      prefill: { email: me.data?.user.email ?? undefined },
    });
    if (outcome.kind === 'dismissed') {
      toast.show(
        outcome.lastFailure
          ? {
              tone: 'info',
              title: 'The payment did not go through',
              text: 'Nothing was charged. Try again when you are ready.',
            }
          : {
              tone: 'info',
              title: 'Checkout closed',
              text: 'Nothing was charged. Pay the fee when you are ready.',
            },
      );
      setPhase('idle');
      return;
    }
    setPhase('confirming');
    noteOwnAction(deal.id);
    try {
      const result = await verify.mutateAsync(outcome.response);
      if (result.deal.status === 'CONFIRMED') {
        setPhase('unconfirmed');
        return;
      }
      toast.show({
        tone: 'ok',
        title: 'Fee paid',
        text: 'Your tax invoice is under Documents and in your email.',
      });
      setPhase('idle');
    } catch (err) {
      if (isApiError(err, 'FEE_CAPTURED_DEAL_CHANGED')) {
        // The money went through, but the deal had changed: ValueSkins refunds it (SPEC 7.3).
        toast.show({ tone: 'error', title: err.message });
        refreshDeal(client, deal.id);
        setPhase('idle');
        return;
      }
      // The money may have left the account even if verify failed: never invite a second payment.
      setPhase('unconfirmed');
    }
  }

  return (
    <>
      <div className="breakdown max-w-[520px]">
        {deal.commissionBasePaise !== null ? (
          <div className="bd-row">
            <p className="t-small">ValueSkins fee</p>
            <p className="money money-s">{formatInr(deal.commissionBasePaise)}</p>
          </div>
        ) : null}
        {deal.commissionGstPaise !== null ? (
          <div className="bd-row">
            <p className="t-small">GST</p>
            <p className="money money-s">{formatInr(deal.commissionGstPaise)}</p>
          </div>
        ) : null}
        <div className="bd-row bd-total">
          <p className="t-body font-semibold">Pay now</p>
          <p className="money money-m font-semibold">{formatInr(total)}</p>
        </div>
      </div>
      {phase === 'unconfirmed' ? (
        <Callout tone="wait" title="Paid, but not confirmed yet" role="status">
          <p>
            Razorpay took the payment but we could not confirm it yet. Check again in a moment. Do
            not pay twice.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              refreshDeal(client, deal.id);
              setPhase('idle');
            }}
          >
            Check payment
          </Button>
        </Callout>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            loading={phase === 'opening' || phase === 'confirming'}
            disabledReason={reasonOf(action)}
            onClick={() => void pay()}
          >
            {phase === 'opening'
              ? 'Opening Razorpay'
              : phase === 'confirming'
                ? 'Confirming your payment'
                : payFeeLabel(total)}
          </Button>
          <p className="t-small c-ink-2">
            Razorpay opens in a window. Your tax invoice comes by email and shows under Documents.
          </p>
        </div>
      )}
    </>
  );
}
