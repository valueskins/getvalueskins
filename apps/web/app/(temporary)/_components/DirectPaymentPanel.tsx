'use client';

import {
  UPI_REFERENCE_REGEX,
  directPaymentInfoSchema,
  directPaymentRecordSchema,
  formatInr,
  type DirectPaymentInfo,
  type DirectPaymentRecordInput,
  type DealActionState,
} from '@valueskins/shared';
import { renderSVG } from 'uqr';
import { useEffect, useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton } from './styles';
import { useAction } from './useAction';

const BLOCKED_TEXT: Record<NonNullable<DirectPaymentInfo['blocked']>, string> = {
  no_creator: 'No creator is confirmed on this deal.',
  not_due: 'No direct payment is due right now.',
  creator_has_no_upi: 'The creator has not added a UPI ID yet.',
  no_consent: 'The creator has not agreed to share a UPI ID yet.',
};

/**
 * The brand's side of a direct payment (REPLACEMENT_PLAN 2.1): who to pay and how much, a upi://pay
 * link and QR code, and the form that records the UPI reference. Recording does not move the deal:
 * the creator confirms. Temporary page, temporary styling.
 */
export function DirectPaymentPanel({
  dealId,
  action,
  onRecorded,
}: {
  dealId: string;
  action: DealActionState;
  onRecorded: () => Promise<void>;
}) {
  const [info, setInfo] = useState<DirectPaymentInfo | null | undefined>(undefined);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const record = useAction();

  async function load() {
    try {
      const response = await apiFetch(`/api/deals/${dealId}/direct-payment`);
      const parsed = directPaymentInfoSchema.safeParse(await response.json());
      setInfo(response.ok && parsed.success ? parsed.data : null);
    } catch {
      setInfo(null);
    }
  }

  useEffect(() => {
    void load();
  }, [dealId, action.action]);

  if (info === undefined) return <p className={hintClass}>Loading payment details</p>;
  if (info === null) return <p className={errorClass}>Could not load the payment details.</p>;
  if (info.blocked) return <p className={hintClass}>{BLOCKED_TEXT[info.blocked]}</p>;

  const stage = info.stage === 'ADVANCE' ? 'advance' : 'final';
  const body: DirectPaymentRecordInput = {
    stage: info.stage as 'ADVANCE' | 'FINAL',
    reference: reference.trim(),
    ...(note.trim() ? { note: note.trim() } : {}),
  };
  const valid = directPaymentRecordSchema.safeParse(body).success;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await record.run(async () => {
      const response = await apiFetch(`/api/deals/${dealId}/direct-payment`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!response.ok) return apiErrorMessage(response, 'Could not record the payment.');
      return null;
    });
    if (ok) {
      setReference('');
      setNote('');
      await onRecorded();
      await load();
    }
  }

  return (
    <section className="space-y-4" aria-label="Pay by UPI">
      <h2 className="text-xl font-semibold">
        Pay the {stage} by UPI: {formatInr(info.amountPaise ?? 0)}
      </h2>
      <p className={hintClass}>
        You pay the creator directly. ValueSkins does not receive or hold this money. The deal moves
        on when the creator confirms it arrived.
      </p>
      <dl className="space-y-1">
        <div className="flex justify-between border-b border-line py-2">
          <dt className={hintClass}>Name on the account</dt>
          <dd>{info.payee?.name}</dd>
        </div>
        <div className="flex justify-between border-b border-line py-2">
          <dt className={hintClass}>UPI ID</dt>
          <dd>{info.payee?.vpa}</dd>
        </div>
      </dl>

      {info.upiUri ? (
        <div className="space-y-3">
          <a className={primaryButton} href={info.upiUri}>
            Open in a UPI app
          </a>
          <div
            role="img"
            aria-label="QR code for the UPI payment"
            className="inline-block bg-white p-2"
            // The SVG comes from our own QR encoder, never from user input.
            dangerouslySetInnerHTML={{ __html: renderSVG(info.upiUri, { ecc: 'M', border: 1 }) }}
            style={{ width: 200, height: 200 }}
          />
          <p className={hintClass}>Check the name and the amount in your UPI app before you pay.</p>
        </div>
      ) : null}

      {info.record ? (
        <p>
          Recorded: UPI reference {info.record.reference}. Waiting for the creator to confirm it.
        </p>
      ) : action.enabled ? (
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-2">
            <span>UPI reference (UTR) of your payment</span>
            <input
              type="text"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="block space-y-2">
            <span>Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <button type="submit" className={primaryButton} disabled={!valid || record.busy}>
            I have paid: record it
          </button>
          {!valid ? (
            <p className={hintClass}>
              {reference.trim() === '' || !UPI_REFERENCE_REGEX.test(reference.trim())
                ? 'Enter the UPI reference from your payment: 6 to 40 letters, digits, hyphens or slashes.'
                : 'Check the note.'}
            </p>
          ) : null}
          {record.error ? <p className={errorClass}>{record.error}</p> : null}
        </form>
      ) : (
        <p className={hintClass}>{action.reason}</p>
      )}
    </section>
  );
}
