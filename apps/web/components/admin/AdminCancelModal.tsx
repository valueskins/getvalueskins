'use client';

import { useState } from 'react';
import {
  ADMIN_CANCEL_WINDOW,
  canTransition,
  formatInr,
  REFUND_REFERENCE_MAX,
  type DealDetail,
  type DealStatus,
} from '@valueskins/shared';
import { useAdminCancel } from '@/lib/api/admin';
import { dealErrorText } from '@/lib/dealErrors';
import { at } from '@/lib/dealView';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { describedBy, Field, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const NOTE_MAX = 5000;

/**
 * Why an admin cannot cancel the deal now, or null when they can. Admins get no
 * allowedActions (WEB_API_GAPS, W3), so this reads the shared transition table.
 */
export function cancelBlockedReason(status: DealStatus): string | null {
  if (status === 'CANCELLED') return 'This deal is already cancelled';
  return canTransition(status, 'CANCELLED', 'ADMIN') ? null : ADMIN_CANCEL_WINDOW;
}

/** AdDealCancel: the admin cancel, with the note both sides read and an optional refund id. */
export function AdminCancelModal({
  deal,
  open,
  onClose,
}: {
  deal: DealDetail;
  open: boolean;
  onClose: () => void;
}) {
  const cancel = useAdminCancel(deal.id);
  const toast = useToast();
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!note.trim()) {
      setError('Add a note. Both sides see it.');
      return;
    }
    setError(null);
    try {
      await cancel.mutateAsync({
        note: note.trim(),
        ...(ref.trim() ? { refundReference: ref.trim() } : {}),
      });
      toast.show({
        tone: 'ok',
        title: 'Deal cancelled',
        text: 'Both sides were emailed. The fee was kept.',
      });
      setNote('');
      setRef('');
      onClose();
    } catch (err) {
      const e = dealErrorText(err);
      toast.show({ tone: 'error', title: e.title, text: e.text });
      if (e.reload) onClose();
    }
  };

  const fee = deal.commissionTotalPaise;
  const advance = deal.advancePaidAt && deal.advancePaise !== null ? deal.advancePaise : null;
  return (
    <Modal
      open={open}
      title={`Cancel ${deal.title ?? 'this deal'}?`}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Keep the deal
          </Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => void submit()}>
            Cancel deal
          </Button>
        </>
      }
    >
      <p>
        The deal stops for both sides.
        {fee !== null ? (
          <>
            {' '}
            The ValueSkins fee of <span className="money text-ink">{formatInr(fee)}</span> is kept.
          </>
        ) : null}
        {advance !== null && deal.creator ? (
          <>
            {' '}
            The {formatInr(advance)} advance went directly to {at(deal.creator.username)} by UPI, so
            ValueSkins cannot move it.
          </>
        ) : null}
      </p>
      <Field
        id="cx-note"
        label="Note"
        help="Both sides see this in the cancel email, as the reason."
        error={error}
        aside={
          <span className="counter">
            {note.length} / {NOTE_MAX}
          </span>
        }
        className="mt-4"
      >
        <Textarea
          id="cx-note"
          value={note}
          maxLength={NOTE_MAX}
          invalid={Boolean(error)}
          aria-describedby={describedBy('cx-note', true, error)}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError(null);
          }}
        />
      </Field>
      <Field
        id="cx-ref"
        label="Refund reference"
        optional
        help="Only if you refunded the fee in Razorpay. It is saved in the deal's activity, not in the email."
        className="mt-4"
      >
        <Input
          id="cx-ref"
          mono
          value={ref}
          maxLength={REFUND_REFERENCE_MAX}
          placeholder="rfnd_..."
          aria-describedby="cx-ref-help"
          onChange={(e) => setRef(e.target.value)}
        />
      </Field>
      <Callout className="mt-4">
        <p>
          Refunds of the fee are done by hand in Razorpay. Cancelling here does not refund anything.
        </p>
      </Callout>
    </Modal>
  );
}
