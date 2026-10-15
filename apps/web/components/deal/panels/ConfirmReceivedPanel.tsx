'use client';

import { useState } from 'react';
import { formatInr, type DealDetail } from '@valueskins/shared';
import { useConfirmPayment, useNotReceived } from '@/lib/api/deals';
import { actionOf, pendingRecord, reasonOf } from '@/lib/dealView';
import { formatDayTime } from '@/lib/dealFormat';
import { Button } from '@/components/ui/Button';
import { describedBy, Field, Textarea } from '@/components/ui/Field';
import { useDealAction } from '../useDealAction';

const REASON_MAX = 500;

/**
 * The confirmed creator checks their UPI app (REPLACEMENT_PLAN 2.1). "I received
 * it" moves the deal on; "Not received" needs a reason and marks the record.
 */
export function ConfirmReceivedPanel({ deal }: { deal: DealDetail }) {
  const action = actionOf(deal, 'CONFIRM_PAYMENT_RECEIVED');
  const record = pendingRecord(deal);
  const confirm = useConfirmPayment(deal.id);
  const notReceived = useNotReceived(deal.id);
  const run = useDealAction(deal.id);
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!action) return null;
  if (!record || !action.enabled) {
    return (
      <Button disabledReason={reasonOf(action) ?? 'The brand has not recorded a payment yet'}>
        I received it
      </Button>
    );
  }

  const send = async () => {
    if (!why.trim()) {
      setError('Tell the brand what happened.');
      return;
    }
    setError(null);
    const done = await run(
      () => notReceived.mutateAsync({ recordId: record.id, reason: why.trim() }),
      {
        success: {
          title: 'We told the brand it did not arrive',
          text: 'They check and record it again. We email you.',
        },
      },
    );
    if (done) {
      setOpen(false);
      setWhy('');
    }
  };

  return (
    <>
      <div className="quote">
        The brand says it paid{' '}
        <span className="money font-medium">{formatInr(record.amountPaise)}</span> to{' '}
        <span className="t-mono">{record.maskedVpa}</span>. Reference{' '}
        <span className="t-mono">{record.reference}</span>. Check your UPI app.
      </div>
      <p className="t-small c-ink-2">
        Recorded {formatDayTime(record.recordedAt)}.
        {record.note ? ` Note from the brand: ${record.note}` : ''}
      </p>
      {open ? (
        <>
          <Field
            id="nr-why"
            label="What happened?"
            help="The brand and ValueSkins see this. Say what you checked."
            error={error}
            className="max-w-[600px]"
            aside={
              <span className="counter">
                {why.length} / {REASON_MAX}
              </span>
            }
          >
            <Textarea
              id="nr-why"
              maxLength={REASON_MAX}
              value={why}
              invalid={Boolean(error)}
              aria-describedby={describedBy('nr-why', true, error)}
              onChange={(e) => setWhy(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void send()} loading={notReceived.isPending}>
              Tell the brand it did not arrive
            </Button>
            <Button variant="text" onClick={() => setOpen(false)}>
              Back
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Button
              loading={confirm.isPending}
              onClick={() =>
                void run(() => confirm.mutateAsync(record.id), {
                  success: {
                    title: 'Payment confirmed',
                    text: 'The payment record is under Documents.',
                  },
                })
              }
            >
              I received it
            </Button>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Not received
            </Button>
          </div>
          <p className="t-small c-ink-2">
            Confirm only when the money is in your account. It moves the deal on and cannot be
            undone.
          </p>
        </>
      )}
    </>
  );
}
