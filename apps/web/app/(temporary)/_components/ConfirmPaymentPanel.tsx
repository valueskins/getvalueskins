'use client';

import {
  directPaymentNotReceivedSchema,
  formatInr,
  type DealActionState,
  type DealDetail,
} from '@valueskins/shared';
import { useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton, secondaryButton } from './styles';
import { useAction } from './useAction';

/**
 * The creator's side of a direct payment (REPLACEMENT_PLAN 2.1): see what the brand recorded, then
 * say the money arrived (the deal moves on) or that it did not (the brand can record again).
 * Temporary page, temporary styling.
 */
export function ConfirmPaymentPanel({
  deal,
  action,
  onDone,
}: {
  deal: DealDetail;
  action: DealActionState;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const confirm = useAction();
  const reject = useAction();
  const pending = deal.directPayments.find((p) => p.status === 'AWAITING_CONFIRMATION');

  async function send(path: string, body: unknown): Promise<string | null> {
    const response = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) return apiErrorMessage(response, 'Something went wrong. Try again.');
    await onDone();
    return null;
  }

  if (!pending) {
    return <p className={hintClass}>{action.reason ?? 'No payment is waiting for you.'}</p>;
  }
  const stage = pending.stage === 'ADVANCE' ? 'advance' : 'final';
  const reasonValid = directPaymentNotReceivedSchema.safeParse({ reason }).success;

  return (
    <section className="space-y-4" aria-label="Confirm the payment">
      <h2 className="text-xl font-semibold">
        The brand says it paid the {stage}: {formatInr(pending.amountPaise)}
      </h2>
      <p>UPI reference: {pending.reference}</p>
      {pending.note ? <p className={hintClass}>Note: {pending.note}</p> : null}
      <p className={hintClass}>
        Paid to {pending.maskedVpa}. Check your UPI app. Confirm only if the money has arrived.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={primaryButton}
          disabled={!action.enabled || confirm.busy || reject.busy}
          onClick={() =>
            void confirm.run(() => send(`/api/direct-payments/${pending.id}/confirm`, {}))
          }
        >
          I received it
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={confirm.busy || reject.busy}
          onClick={() => setAsking(true)}
        >
          Not received
        </button>
      </div>
      {asking ? (
        <div className="space-y-3">
          <label className="block space-y-2">
            <span>What happened?</span>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            className={secondaryButton}
            disabled={!reasonValid || reject.busy}
            onClick={() =>
              void reject.run(() =>
                send(`/api/direct-payments/${pending.id}/not-received`, { reason: reason.trim() }),
              )
            }
          >
            Send: the money did not arrive
          </button>
          {!reasonValid ? <p className={hintClass}>Say what happened to send this.</p> : null}
        </div>
      ) : null}
      {confirm.error ? <p className={errorClass}>{confirm.error}</p> : null}
      {reject.error ? <p className={errorClass}>{reject.error}</p> : null}
    </section>
  );
}
