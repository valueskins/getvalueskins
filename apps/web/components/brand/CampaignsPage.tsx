'use client';

import Link from 'next/link';
import { useState } from 'react';
import { validateDealForPublish, type DealMineItem } from '@valueskins/shared';
import { useDeleteDraft, useMyDeals } from '@/lib/api/deals';
import { errorText } from '@/lib/api/errors';
import { useConfig } from '@/lib/api/queries';
import { countdown, shortDate } from '@/lib/deadlines';
import { currentStepNumber, NEXT_STEP_LABEL } from '@/lib/dealStatus';
import { formatFullDayTime } from '@/lib/dealFormat';
import { at } from '@/lib/dealView';
import { Button } from '@/components/ui/Button';
import { Badge, Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Money } from '@/components/ui/Money';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { cx } from '@/components/ui/cx';
import { StatusBadge } from '@/components/deal/StatusBadge';
import { useNow } from '@/components/deal/useNow';
import { EmptyState } from '@/components/lists/EmptyState';
import { ShowMore } from '@/components/lists/ShowMore';
import { listSteps } from '@/components/creator/MyDealsPage';

type Group = 'drafts' | 'open' | 'progress' | 'completed' | 'cancelled';

export function groupOf(d: DealMineItem): Group {
  switch (d.status) {
    case 'DRAFT':
      return 'drafts';
    case 'OPEN':
      return 'open';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'progress';
  }
}

const GROUPS: Array<{ id: Group; label: string; note: string }> = [
  { id: 'drafts', label: 'Drafts', note: 'Only you can see drafts.' },
  {
    id: 'open',
    label: 'Open',
    note: 'Creators can apply until the apply-by date. You can confirm one after it too.',
  },
  { id: 'progress', label: 'In progress', note: '' },
  { id: 'completed', label: 'Completed', note: '' },
  { id: 'cancelled', label: 'Cancelled', note: '' },
];

/** The first thing a draft still needs, from the same check the API runs at publish. */
function missing(d: DealMineItem, now: Date, minBudgetPaise?: number): string {
  const issues = validateDealForPublish(
    {
      title: d.title,
      description: d.description,
      budgetPaise: d.budgetPaise,
      applicationDeadline: d.applicationDeadline,
      contentUploadDeadline: d.contentUploadDeadline,
      dealDeadline: d.dealDeadline,
    },
    now,
    minBudgetPaise,
  );
  return issues.length ? issues[0]!.message : 'Ready to publish';
}

function DraftRow({ d, onDelete }: { d: DealMineItem; onDelete: (d: DealMineItem) => void }) {
  const now = useNow();
  const config = useConfig();
  return (
    <li className="grid gap-3 border-t border-rule px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,2fr)_140px_minmax(0,1.6fr)_200px] md:items-center md:gap-5 md:px-6">
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/campaigns/${d.id}/edit`} className="t-body truncate">
          {d.title ?? 'Untitled draft'}
        </Link>
        <p className="t-small c-ink-2">Created {formatFullDayTime(d.createdAt).split(',')[0]}</p>
      </div>
      <p>
        {d.budgetPaise !== null ? (
          <Money paise={d.budgetPaise} size="s" />
        ) : (
          <span className="t-small c-ink-3">No budget yet</span>
        )}
      </p>
      <p className="t-small c-ink-2">{missing(d, now, config.data?.minBudgetPaise)}</p>
      <div className="flex items-center gap-2 md:justify-end">
        <Link href={`/campaigns/${d.id}/edit`} className="btn btn-secondary btn-sm">
          Continue
        </Link>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Delete ${d.title ?? 'draft'}`}
          onClick={() => onDelete(d)}
        >
          <Icon name="trash" />
        </Button>
      </div>
    </li>
  );
}

function OpenRow({ d }: { d: DealMineItem }) {
  const now = useNow();
  const deadline = d.applicationDeadline;
  const c = deadline ? countdown(deadline, now) : null;
  return (
    <li className="grid gap-3 border-t border-rule px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,2fr)_140px_130px_minmax(0,1.5fr)_190px] md:items-center md:gap-5 md:px-6">
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/deals/${d.id}`} className="t-body truncate">
          {d.title}
        </Link>
        <p className="t-small c-ink-2">
          <span className="t-mono c-ink-3">{d.shortId}</span>
          {d.publishedAt ? ` Posted ${formatFullDayTime(d.publishedAt).split(',')[0]}` : ''}
        </p>
      </div>
      <p>{d.budgetPaise !== null ? <Money paise={d.budgetPaise} size="s" /> : null}</p>
      <p className="t-small">
        <span className="t-mono">{d.applicantCount ?? 0}</span> applied
      </p>
      {deadline && c ? (
        d.applicationsOpen ? (
          <p className="t-small c-ink-2">
            Closes {shortDate(deadline)} <span className="c-ink-3">({c.text})</span>
          </p>
        ) : (
          <p className="t-small font-medium text-wait">
            Closed {shortDate(deadline)}. Pick a creator.
          </p>
        )
      ) : (
        <span />
      )}
      <div className="md:text-right">
        <Link href={`/deals/${d.id}`} className="btn btn-secondary btn-sm">
          Review applicants
        </Link>
      </div>
    </li>
  );
}

function ProgressCard({ d }: { d: DealMineItem }) {
  const steps = listSteps(d.status);
  const n = currentStepNumber(steps);
  const next = d.nextStep ? NEXT_STEP_LABEL[d.nextStep].brand : null;
  return (
    <article className="card deal-card flex flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="t-h3">
            <Link href={`/deals/${d.id}`} className="stretched">
              {d.title}
            </Link>
          </h3>
          {d.creator ? <p className="t-small c-ink-2">with {at(d.creator.username)}</p> : null}
        </div>
        <StatusBadge status={d.status} />
      </div>
      <div className="steps-compact" aria-label={`Step ${n} of 9`}>
        <div className="seg" aria-hidden="true">
          {steps.map((s) => (
            <span
              key={s.label}
              className={
                s.state === 'done' ? 'done' : s.state === 'current' ? 'current' : undefined
              }
            />
          ))}
        </div>
        <p className="t-label c-ink-2">
          Step {n} of 9: {steps[n - 1]?.label}
        </p>
      </div>
      {d.yourTurn && next ? (
        <div className="callout callout-wait">
          <div>
            <p className="callout-title">Your turn</p>
            <p>{next}</p>
          </div>
        </div>
      ) : next ? (
        <p className="t-small c-ink-2">{next}</p>
      ) : null}
    </article>
  );
}

function ClosedRow({ d }: { d: DealMineItem }) {
  const cancelled = d.status === 'CANCELLED';
  const when = cancelled ? d.cancelledAt : d.completedAt;
  return (
    <li className="grid gap-3 border-t border-rule px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,2fr)_140px_140px_minmax(0,1.5fr)] md:items-center md:gap-5 md:px-6">
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/deals/${d.id}`} className="t-body truncate">
          {d.title}
        </Link>
        {d.creator ? <p className="t-small c-ink-2">with {at(d.creator.username)}</p> : null}
      </div>
      <p className="t-small c-ink-2">{when ? formatFullDayTime(when).split(',')[0] : ''}</p>
      <p>{d.budgetPaise !== null ? <Money paise={d.budgetPaise} size="s" /> : null}</p>
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={d.status} />
        {cancelled && d.cancellationReason ? (
          <p className="t-small c-ink-2 line-clamp-2">{d.cancellationReason}</p>
        ) : null}
      </div>
    </li>
  );
}

/** `/campaigns` (BrCampaigns, BrCampaignsEmpty). */
export function CampaignsPage() {
  const list = useMyDeals('');
  const remove = useDeleteDraft();
  const toast = useToast();
  const [show, setShow] = useState<Group | 'all'>('all');
  const [deleting, setDeleting] = useState<DealMineItem | null>(null);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const by = (g: Group) => items.filter((d) => groupOf(d) === g);
  const needYou = by('progress').filter((d) => d.yourTurn).length;

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.show({ tone: 'info', title: 'Draft deleted' });
    } catch (err) {
      toast.show({ tone: 'error', title: errorText(err) });
    }
    setDeleting(null);
  };

  return (
    <div className="page">
      <div className="page-head mb-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="t-h1">Campaigns</h1>
          <p className="t-body c-ink-2">Every deal you have posted, from drafts to completed.</p>
        </div>
      </div>
      {list.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : list.isError ? (
        <Callout tone="error" title="We could not load your deals" role="alert">
          <p>{errorText(list.error)}</p>
        </Callout>
      ) : items.length === 0 ? (
        <EmptyState
          title="You have not posted a deal yet"
          text="Write a brief, set the amount and three dates, then publish. Every creator sees it in their feed straight away."
        >
          <Link href="/campaigns/new" className="btn btn-primary">
            <Icon name="plus" />
            Post a deal
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="fchips mb-8" role="group" aria-label="Show">
            {[
              { id: 'all' as const, label: 'All', n: items.length },
              ...GROUPS.map((g) => ({ id: g.id, label: g.label, n: by(g.id).length })),
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                className={cx('fchip', show === c.id && 'is-active')}
                aria-pressed={show === c.id}
                onClick={() => setShow(c.id)}
              >
                {c.label} <span className="count">{c.n}</span>
              </button>
            ))}
          </div>
          {GROUPS.filter((g) => show === 'all' || show === g.id).map((g) => {
            const rows = by(g.id);
            if (rows.length === 0 && show === 'all') return null;
            return (
              <section key={g.id} className="group" aria-labelledby={`g-${g.id}`}>
                <div className="group-head">
                  <h2 id={`g-${g.id}`} className="group-title">
                    {g.label} <span className="count">{rows.length}</span>
                  </h2>
                  {g.id === 'progress' && needYou ? (
                    <Badge kind="wait">{needYou} need you</Badge>
                  ) : g.note ? (
                    <p className="t-small c-ink-2 hidden md:block">{g.note}</p>
                  ) : null}
                </div>
                {rows.length === 0 ? (
                  <p className="card t-small c-ink-2 px-6 py-4">Nothing here yet.</p>
                ) : g.id === 'progress' ? (
                  <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6">
                    {rows.map((d) => (
                      <ProgressCard key={d.id} d={d} />
                    ))}
                  </div>
                ) : (
                  <div className="card overflow-hidden">
                    <ul className="m-0 list-none p-0">
                      {rows.map((d) =>
                        g.id === 'drafts' ? (
                          <DraftRow key={d.id} d={d} onDelete={setDeleting} />
                        ) : g.id === 'open' ? (
                          <OpenRow key={d.id} d={d} />
                        ) : (
                          <ClosedRow key={d.id} d={d} />
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
          <ShowMore
            hasMore={Boolean(list.hasNextPage)}
            loading={list.isFetchingNextPage}
            onMore={() => void list.fetchNextPage()}
            label="Show more deals"
          />
        </>
      )}
      <Modal
        open={deleting !== null}
        title={`Delete ${deleting?.title ?? 'this draft'}?`}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmDelete()}
              loading={remove.isPending}
            >
              Delete draft
            </Button>
          </>
        }
      >
        <p>The draft is removed. Nobody else has seen it. This cannot be undone.</p>
      </Modal>
    </div>
  );
}
