'use client';

import { useState, type FormEvent } from 'react';
import {
  formatInr,
  INVALID_UPI_REFERENCE,
  UPI_REFERENCE_REGEX,
  type DealDetail,
  type DirectPaymentInfo,
} from '@valueskins/shared';
import { useDirectPayment, useRecordPayment } from '@/lib/api/deals';
import { actionOf, at, lastNotReceived, reasonOf } from '@/lib/dealView';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { describedBy, Field, Input, Textarea } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { PaymentRecord } from '../PaymentRecord';
import { Qr } from '../Qr';
import { useDealAction } from '../useDealAction';

const NOTE_MAX = 500;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-live="polite"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? 'Copied' : 'Copy UPI ID'}
    </Button>
  );
}

function RecordForm({ deal, info }: { deal: DealDetail; info: DirectPaymentInfo }) {
  const record = useRecordPayment(deal.id);
  const run = useDealAction(deal.id);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const creator = deal.creator ? at(deal.creator.username) : 'The creator';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ref = reference.trim();
    if (!UPI_REFERENCE_REGEX.test(ref)) {
      setError(INVALID_UPI_REFERENCE);
      return;
    }
    setError(null);
    const done = await run(
      () =>
        record.mutateAsync({
          stage: info.stage!,
          reference: ref,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      {
        context: 'record',
        success: { title: 'Payment recorded', text: `We emailed ${creator} to check it arrived.` },
      },
    );
    if (done) {
      setReference('');
      setNote('');
    }
  }

  return (
    <form className="np-foot" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1">
        <h3 className="t-h3">Record the payment</h3>
        <p className="t-small c-ink-2">
          After you pay, tell us the UPI reference. {creator} gets an email to check it arrived. The
          deal moves on only when they confirm it.
        </p>
      </div>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Field
          id="utr"
          label="UPI reference (UTR)"
          help="In your UPI app, open this payment's details. It is usually 12 digits."
          error={error}
        >
          <Input
            id="utr"
            mono
            autoComplete="off"
            value={reference}
            invalid={Boolean(error)}
            aria-describedby={describedBy('utr', true, error)}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <Field
          id="pnote"
          label="Note"
          optional
          aside={
            <span className="counter">
              {note.length} / {NOTE_MAX}
            </span>
          }
        >
          <Textarea
            id="pnote"
            className="!min-h-[44px]"
            maxLength={NOTE_MAX}
            value={note}
            placeholder="For example: paid from HDFC"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" loading={record.isPending}>
          I have paid
        </Button>
      </div>
    </form>
  );
}

/**
 * Payments 2 and 3: the brand pays the creator from its own UPI app
 * (REPLACEMENT_PLAN 2.1). The full UPI ID is shown here and nowhere else.
 */
export function UpiPayPanel({ deal }: { deal: DealDetail }) {
  const action = actionOf(deal, deal.status === 'APPROVED' ? 'PAY_FINAL' : 'PAY_ADVANCE');
  const reason = reasonOf(action);
  const info = useDirectPayment(deal.id, Boolean(action));
  const disputed = lastNotReceived(deal);
  const creator = deal.creator ? at(deal.creator.username) : 'the creator';

  if (!action) return null;
  if (info.isPending) {
    return (
      <div className="np-body">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const data = info.data;
  const blocked =
    !data || data.blocked !== null || !data.payee || !data.upiUri || data.amountPaise === null;

  if (blocked) {
    const title =
      data?.blocked === 'no_consent'
        ? 'The creator has not agreed to share their UPI ID'
        : data?.blocked === 'creator_has_no_upi'
          ? 'The creator has not added a UPI ID yet'
          : (reason ?? 'The payment details are not ready yet');
    const text =
      data?.blocked === 'no_consent'
        ? `${creator} saved a UPI ID but has not agreed to show it to you. They do that in Settings.`
        : data?.blocked === 'creator_has_no_upi'
          ? `${creator} needs to add a UPI ID in Settings before you can pay.`
          : 'The payment details show here as soon as they are ready.';
    return (
      <div className="np-body">
        <Callout tone="wait" title={title} role="status">
          <p>{text}</p>
        </Callout>
        <Button variant="secondary" disabledReason={reason ?? title}>
          Pay with UPI app
        </Button>
      </div>
    );
  }

  const amount = formatInr(data.amountPaise!);
  return (
    <>
      <div className="np-body">
        {disputed ? (
          <>
            <Callout
              tone="error"
              role="alert"
              title={`The creator says the payment did not arrive: ${disputed.disputeReason ?? ''}`}
            >
              <p>
                Check your UPI app or bank statement. If the money left your account, write to us
                with the reference. Otherwise pay again and record it below.
              </p>
            </Callout>
            <div className="card overflow-hidden">
              <PaymentRecord record={disputed} viewer="brand" />
            </div>
          </>
        ) : null}
        <div className="np-split">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="t-small c-ink-2">Pay to</p>
              <div className="flex flex-wrap items-center gap-3">
                <p className="upi-full">{data.payee!.vpa}</p>
                <CopyButton text={data.payee!.vpa} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <p className="t-small c-ink-2">Name on the account</p>
              <p className="t-body font-medium">{data.payee!.name}</p>
            </div>
            <Callout tone="wait">
              <p className="font-medium">
                Check that your UPI app shows this name before you pay. A payment to a wrong UPI ID
                cannot be recalled.
              </p>
            </Callout>
            <div className="flex flex-wrap items-center gap-3">
              <a href={data.upiUri!} className="btn btn-secondary">
                Pay with UPI app
              </a>
              <p className="t-small c-ink-2">
                On a phone this opens your UPI app with {amount} filled in.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <Qr value={data.upiUri!} label={`UPI QR code for ${amount} to ${data.payee!.vpa}`} />
            <p className="money money-m">{amount}</p>
            <p className="t-small c-ink-2">Scan with any UPI app</p>
          </div>
        </div>
      </div>
      <RecordForm deal={deal} info={data} />
    </>
  );
}
