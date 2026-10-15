'use client';

import { useState } from 'react';
import { formatInr, type DealDetail } from '@valueskins/shared';
import { useApprove, useSendFeedback } from '@/lib/api/deals';
import { actionOf, at, reasonOf } from '@/lib/dealView';
import { formatDayTime } from '@/lib/dealFormat';
import { Button } from '@/components/ui/Button';
import { describedBy, Field, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useDealAction } from '../useDealAction';

const FEEDBACK_MAX = 5000;

/** Shows the latest content link. Used by the brand's review and the creator's wait. */
export function LatestLink({ deal, mine }: { deal: DealDetail; mine: boolean }) {
  const latest = deal.contentUploads[deal.contentUploads.length - 1];
  if (!latest) return null;
  return (
    <div className="card flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="t-small c-ink-2">
          {mine ? 'You shared' : 'Shared'} {formatDayTime(latest.uploadedAt)}
        </p>
        <a
          href={latest.link}
          target="_blank"
          rel="noreferrer"
          className="t-mono t-small block truncate"
        >
          {latest.link}
        </a>
      </div>
      <a
        href={latest.link}
        target="_blank"
        rel="noreferrer"
        className="btn btn-secondary btn-sm flex-none"
      >
        {mine ? 'Open' : 'Open in Google Drive'}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}

/** The brand reviews the content: approve (with a confirm naming the final amount) or ask for changes. */
export function ReviewPanel({ deal }: { deal: DealDetail }) {
  const approveAction = actionOf(deal, 'APPROVE');
  const feedbackAction = actionOf(deal, 'SEND_FEEDBACK');
  const approve = useApprove(deal.id);
  const feedback = useSendFeedback(deal.id);
  const run = useDealAction(deal.id);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const creator = deal.creator ? at(deal.creator.username) : 'The creator';

  const send = async () => {
    if (!text.trim()) {
      setError('Write what should change.');
      return;
    }
    setError(null);
    const done = await run(() => feedback.mutateAsync(text.trim()), {
      success: { title: 'Changes sent', text: `${creator} shares a new link. We email you.` },
    });
    if (done) {
      setWriting(false);
      setText('');
    }
  };

  const doApprove = async () => {
    const done = await run(() => approve.mutateAsync(), {
      success: { title: 'Content approved', text: 'Pay the final amount by UPI next.' },
    });
    if (done) setAsking(false);
  };

  return (
    <>
      <LatestLink deal={deal} mine={false} />
      {writing ? (
        <>
          <Field
            id="fb"
            label="What should change?"
            className="max-w-[640px]"
            help={`${creator} sees this and shares a new link. Be specific: which part, and what to do instead.`}
            error={error}
            aside={
              <span className="counter">
                {text.length} / {FEEDBACK_MAX}
              </span>
            }
          >
            <Textarea
              id="fb"
              maxLength={FEEDBACK_MAX}
              value={text}
              invalid={Boolean(error)}
              aria-describedby={describedBy('fb', true, error)}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void send()} loading={feedback.isPending}>
              Send changes
            </Button>
            <Button variant="text" onClick={() => setWriting(false)}>
              Back
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          {approveAction ? (
            <Button disabledReason={reasonOf(approveAction)} onClick={() => setAsking(true)}>
              Approve
            </Button>
          ) : null}
          {feedbackAction ? (
            <Button
              variant="secondary"
              disabledReason={reasonOf(feedbackAction)}
              onClick={() => setWriting(true)}
            >
              Suggest changes
            </Button>
          ) : null}
        </div>
      )}
      <Modal
        open={asking}
        title="Approve the content?"
        onClose={() => setAsking(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Not yet
            </Button>
            <Button onClick={() => void doApprove()} loading={approve.isPending}>
              Approve
            </Button>
          </>
        }
      >
        <p>
          You will then pay the final{' '}
          {deal.finalPaise !== null ? formatInr(deal.finalPaise) : 'amount'} to the creator by UPI.
        </p>
        <p className="mt-3">
          You approve link {deal.contentUploads.length}. You cannot ask for changes after this.
        </p>
      </Modal>
    </>
  );
}
