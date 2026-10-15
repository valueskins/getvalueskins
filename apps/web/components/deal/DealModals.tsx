'use client';

import { useState } from 'react';
import { DISPUTE_SUBJECT_MAX, DISPUTE_TEXT_MAX, type DealDetail } from '@valueskins/shared';
import { useCancelDeal, useRaiseDispute } from '@/lib/api/deals';
import { at } from '@/lib/dealView';
import { Button } from '@/components/ui/Button';
import { describedBy, Field, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useDealAction } from './useDealAction';

export function CancelModal({
  deal,
  open,
  onClose,
}: {
  deal: DealDetail;
  open: boolean;
  onClose: () => void;
}) {
  const cancel = useCancelDeal(deal.id);
  const run = useDealAction(deal.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const who = deal.creator ? at(deal.creator.username) : 'Applicants';
  const text = deal.creator
    ? `${at(deal.creator.username)} is told the deal was cancelled.`
    : 'Everyone who applied is told the deal was cancelled.';

  const submit = async () => {
    if (!reason.trim()) {
      setError('Say why you are cancelling.');
      return;
    }
    setError(null);
    const done = await run(() => cancel.mutateAsync(reason.trim()), {
      success: { title: 'Deal cancelled', text: 'No fee was charged.' },
    });
    if (done) {
      setReason('');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      title={`Cancel ${deal.title ?? 'this deal'}?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep the deal
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={cancel.isPending}>
            Cancel deal
          </Button>
        </>
      }
    >
      <p>{text} No fee is charged. This cannot be undone.</p>
      <Field
        id="cancel-why"
        label="Why are you cancelling?"
        help={`${who} ${deal.creator ? 'sees' : 'see'} this, and it goes in the email.`}
        error={error}
        className="mt-4"
      >
        <Textarea
          id="cancel-why"
          value={reason}
          invalid={Boolean(error)}
          aria-describedby={describedBy('cancel-why', true, error)}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

export function DisputeModal({
  deal,
  open,
  onClose,
}: {
  deal: DealDetail;
  open: boolean;
  onClose: () => void;
}) {
  const raise = useRaiseDispute(deal.id);
  const run = useDealAction(deal.id);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ subject?: string; description?: string }>({});

  const submit = async () => {
    const next = {
      subject: subject.trim() ? undefined : 'Add a subject.',
      description: description.trim() ? undefined : 'Say what happened.',
    };
    setErrors(next);
    if (next.subject || next.description) return;
    const done = await run(
      () => raise.mutateAsync({ subject: subject.trim(), description: description.trim() }),
      {
        context: 'dispute',
        success: {
          title: 'Dispute raised',
          text: 'We emailed both of you a copy. ValueSkins replies by email.',
        },
      },
    );
    if (done) {
      setSubject('');
      setDescription('');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      title="Raise a dispute"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button onClick={() => void submit()} loading={raise.isPending}>
            Raise dispute
          </Button>
        </>
      }
    >
      <p>
        ValueSkins looks into it. Both of you get a copy by email. The deal stays where it is while
        we do.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <Field
          id="ds-subject"
          label="Subject"
          error={errors.subject}
          aside={
            <span className="counter">
              {subject.length} / {DISPUTE_SUBJECT_MAX}
            </span>
          }
        >
          <Input
            id="ds-subject"
            maxLength={DISPUTE_SUBJECT_MAX}
            value={subject}
            invalid={Boolean(errors.subject)}
            aria-describedby={describedBy('ds-subject', null, errors.subject)}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>
        <Field
          id="ds-desc"
          label="What happened?"
          help="Dates, amounts and UPI references help. Do not include bank account numbers."
          error={errors.description}
          aside={
            <span className="counter">
              {description.length} / {DISPUTE_TEXT_MAX}
            </span>
          }
        >
          <Textarea
            id="ds-desc"
            maxLength={DISPUTE_TEXT_MAX}
            value={description}
            invalid={Boolean(errors.description)}
            aria-describedby={describedBy('ds-desc', true, errors.description)}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
