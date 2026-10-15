'use client';

import { useState } from 'react';
import { formatInr, type DealApplicationItem, type DealDetail } from '@valueskins/shared';
import { useConfirmApplicant, useDealApplications } from '@/lib/api/deals';
import { at } from '@/lib/dealView';
import { formatDayTime } from '@/lib/dealFormat';
import { formatCount, formatPercent } from '@/lib/format';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Callout';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  ResumeContent,
  ResumeSkeleton,
  ResumeUnavailable,
} from '@/components/resume/ResumeContent';
import { useResume } from '@/lib/api/queries';
import { ApiError } from '@/lib/api/client';
import { useDealAction } from '../useDealAction';

function InlineResume({ userId }: { userId: string }) {
  const resume = useResume(userId, true);
  if (resume.data) return <ResumeContent data={resume.data} />;
  if (resume.error instanceof ApiError && resume.error.status === 404) return <ResumeUnavailable />;
  return <ResumeSkeleton />;
}

function Row({
  item,
  onConfirm,
}: {
  item: DealApplicationItem;
  onConfirm: (item: DealApplicationItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = item.creator;
  return (
    <li className="border-t border-rule first:border-t-0">
      <div className="grid items-center gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,2fr)_96px_96px_minmax(0,1.2fr)] md:gap-5 md:px-6">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2.5 border-0 bg-transparent p-0 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Avatar name={c.username} src={c.profilePictureUrl} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="chip-name">{at(c.username)}</span>
            <span className="chip-sub">
              {c.name}, applied {formatDayTime(item.createdAt)}
            </span>
          </span>
          <span className="sr-only">{open ? ', hide profile' : ', show profile'}</span>
        </button>
        <p className="app-num md:text-right">
          <span className="t-label c-ink-2 mr-2 md:hidden">Followers</span>
          {c.followersCount !== null ? formatCount(c.followersCount) : 'Not shown'}
        </p>
        <p className="app-num md:text-right">
          <span className="t-label c-ink-2 mr-2 md:hidden">Engagement</span>
          {c.engagementRate !== null ? formatPercent(c.engagementRate) : 'Not shown'}
        </p>
        <div className="flex flex-col items-start gap-1 md:items-end">
          {item.status === 'APPLIED' ? (
            <Button
              variant="secondary"
              size="sm"
              disabledReason={item.confirm.enabled ? null : item.confirm.reason}
              onClick={() => onConfirm(item)}
            >
              Confirm
            </Button>
          ) : (
            <Badge kind={item.status === 'CONFIRMED' ? 'ok' : 'cancelled'}>
              {item.status === 'CONFIRMED' ? 'Confirmed' : 'Not selected'}
            </Badge>
          )}
        </div>
      </div>
      {open ? (
        <div className="app-more">
          <div className="card overflow-hidden">
            <InlineResume userId={c.id} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** The applicants on an open deal, in the brand's Next step (BrApplicants). */
export function ApplicantsPanel({ deal }: { deal: DealDetail }) {
  const list = useDealApplications(deal.id, true);
  const confirm = useConfirmApplicant(deal.id);
  const run = useDealAction(deal.id);
  const [asking, setAsking] = useState<DealApplicationItem | null>(null);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const others = Math.max(0, items.filter((i) => i.status === 'APPLIED').length - 1);

  const doConfirm = async () => {
    if (!asking) return;
    const done = await run(() => confirm.mutateAsync(asking.id), {
      success: {
        title: `You confirmed ${at(asking.creator.username)}`,
        text: 'Pay the ValueSkins fee to start the deal.',
      },
    });
    if (done) setAsking(null);
  };

  if (list.isPending) return <Skeleton className="h-32 w-full" />;
  if (items.length === 0) {
    return (
      <p className="t-body c-ink-2">
        No applications yet. Creators see this deal in their feed now.
      </p>
    );
  }
  return (
    <>
      <div className="card overflow-hidden">
        <div
          className="hidden gap-5 border-b border-rule bg-page px-6 py-2 md:grid md:grid-cols-[minmax(0,2fr)_96px_96px_minmax(0,1.2fr)]"
          aria-hidden="true"
        >
          <p className="t-label c-ink-2">Creator</p>
          <p className="t-label c-ink-2 text-right">Followers</p>
          <p className="t-label c-ink-2 text-right">Engagement</p>
          <span />
        </div>
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <Row key={item.id} item={item} onConfirm={setAsking} />
          ))}
        </ul>
      </div>
      {list.hasNextPage ? (
        <Button
          variant="text"
          size="sm"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Show more applicants
        </Button>
      ) : null}
      <Modal
        open={asking !== null}
        title={`Confirm ${asking ? at(asking.creator.username) : ''} for ${deal.title ?? 'this deal'}?`}
        onClose={() => setAsking(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              Not yet
            </Button>
            <Button onClick={doConfirm} loading={confirm.isPending}>
              Confirm {asking ? at(asking.creator.username) : ''}
            </Button>
          </>
        }
      >
        <p>
          {others > 0
            ? `The other ${others} ${others === 1 ? 'applicant is' : 'applicants are'} told they were not selected. `
            : ''}
          You cannot change this later.
        </p>
        <div className="breakdown mt-4">
          {deal.commissionTotalPaise !== null ? (
            <div className="bd-row">
              <p className="t-small">Next, the ValueSkins fee, through Razorpay</p>
              <p className="money money-s">{formatInr(deal.commissionTotalPaise)}</p>
            </div>
          ) : null}
          {deal.advancePaise !== null ? (
            <div className="bd-row">
              <p className="t-small">Then to the creator by UPI, before work starts</p>
              <p className="money money-s">{formatInr(deal.advancePaise)}</p>
            </div>
          ) : null}
          {deal.finalPaise !== null ? (
            <div className="bd-row">
              <p className="t-small">And by UPI, after you approve</p>
              <p className="money money-s">{formatInr(deal.finalPaise)}</p>
            </div>
          ) : null}
        </div>
        <p className="mt-3">You can still cancel for free until you pay the fee.</p>
      </Modal>
    </>
  );
}
