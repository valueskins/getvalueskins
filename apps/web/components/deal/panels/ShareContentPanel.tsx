'use client';

import { useState, type FormEvent } from 'react';
import {
  dealContentLinkSchema,
  MAX_CONTENT_UPLOADS_PER_DEAL,
  type DealDetail,
} from '@valueskins/shared';
import { useShareContent } from '@/lib/api/deals';
import { actionOf, reasonOf } from '@/lib/dealView';
import { longDate } from '@/lib/deadlines';
import { zodFieldErrors } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { describedBy, Field, Input } from '@/components/ui/Field';
import { DeadlineBadge } from '../DeadlineBadge';
import { useDealAction } from '../useDealAction';

/** The confirmed creator shares a Google Drive link, first time or after changes. */
export function ShareContentPanel({
  deal,
  onDispute,
}: {
  deal: DealDetail;
  onDispute: () => void;
}) {
  const action = actionOf(deal, 'UPLOAD_CONTENT');
  const share = useShareContent(deal.id);
  const run = useDealAction(deal.id);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const changes = deal.status === 'REVISION_REQUESTED';

  if (!action) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = dealContentLinkSchema.safeParse({ link: link.trim() });
    if (!parsed.success) {
      setError(zodFieldErrors(parsed.error.issues).link ?? 'Must be a Google Drive link');
      return;
    }
    setError(null);
    const done = await run(() => share.mutateAsync(parsed.data.link), {
      success: { title: 'Content shared', text: 'The brand reviews it. We email you either way.' },
    });
    if (done) setLink('');
  }

  return (
    <>
      {changes && deal.feedback ? (
        <div className="flex flex-col gap-1.5">
          <p className="t-small c-ink-2">What the brand asked for</p>
          <div className="quote">{deal.feedback}</div>
        </div>
      ) : null}
      {deal.revisionNotice ? (
        <div className="callout callout-wait flex-wrap items-center justify-between" role="status">
          <p className="font-medium">{deal.revisionNotice}</p>
          <Button variant="secondary" size="sm" className="bg-surface" onClick={onDispute}>
            Raise a dispute
          </Button>
        </div>
      ) : null}
      {deal.contentUploadDeadline ? (
        <p className="t-small flex flex-wrap items-center gap-2">
          Content due {longDate(deal.contentUploadDeadline)}, 11:59 pm IST{' '}
          <DeadlineBadge date={deal.contentUploadDeadline} />
        </p>
      ) : null}
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field
          id="drive"
          label="Google Drive link"
          className="max-w-[640px]"
          help={`Set sharing to anyone with the link, so the brand can open it. Link ${Math.min(
            deal.uploadCount + 1,
            MAX_CONTENT_UPLOADS_PER_DEAL,
          )} of up to ${MAX_CONTENT_UPLOADS_PER_DEAL} on this deal.`}
          error={error}
        >
          <Input
            id="drive"
            mono
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/..."
            value={link}
            invalid={Boolean(error)}
            aria-describedby={describedBy('drive', true, error)}
            onChange={(e) => setLink(e.target.value)}
          />
        </Field>
        <div>
          <Button type="submit" loading={share.isPending} disabledReason={reasonOf(action)}>
            {changes ? 'Share new link' : 'Share content'}
          </Button>
        </div>
      </form>
    </>
  );
}
