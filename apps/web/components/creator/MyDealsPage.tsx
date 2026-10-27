'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatInr, type DealMineItem } from '@valueskins/shared';
import { useMyDeals } from '@/lib/api/deals';
import { errorText } from '@/lib/api/errors';
import { countdown, shortDate } from '@/lib/deadlines';
import { dealSteps, currentStepNumber, NEXT_STEP_LABEL } from '@/lib/dealStatus';
import { formatFullDayTime } from '@/lib/dealFormat';
import { Callout } from '@/components/ui/Callout';
import { Money } from '@/components/ui/Money';
import { Skeleton } from '@/components/ui/Skeleton';
import { UserChip } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/deal/StatusBadge';
import { useNow } from '@/components/deal/useNow';
import { EmptyState } from '@/components/lists/EmptyState';
import { ShowMore } from '@/components/lists/ShowMore';
import { Tabs } from '@/components/lists/Tabs';

export const ACTIVE_STATUSES =
  'CONFIRMED,COMMISSION_PAID,ADVANCE_PAID,CONTENT_UPLOADED,REVISION_REQUESTED,APPROVED';
export const DONE_STATUSES = 'COMPLETED,CANCELLED';

/** The step bar for a list row: only the status is known here, not the step dates. */
export function listSteps(status: DealMineItem['status']) {
  return dealSteps({
    status,
    publishedAt: null,
    confirmedAt: null,
    commissionPaidAt: null,
    advancePaidAt: null,
    contentUploadedAt: null,
    approvedAt: null,
    completedAt: null,
  });
}

function ActiveCard({ deal }: { deal: DealMineItem }) {
  const now = useNow();
  const steps = listSteps(deal.status);
  const n = currentStepNumber(steps);
  const next = deal.nextStep ? NEXT_STEP_LABEL[deal.nextStep].creator : null;
  const due = deal.contentUploadDeadline;
  const c = due ? countdown(due, now) : null;
  return (
    <article className="card deal-card flex flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="t-h3">
            <Link href={`/deals/${deal.id}`} className="stretched">
              {deal.title}
            </Link>
          </h2>
          <UserChip username={deal.brand.username} src={deal.brand.profilePictureUrl} />
        </div>
        <StatusBadge status={deal.status} />
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
      {deal.yourTurn && next ? (
        <div className="callout callout-wait">
          <div>
            <p className="callout-title">Your turn</p>
            <p>{next}</p>
          </div>
        </div>
      ) : next ? (
        <p className="t-small c-ink-2">{next}</p>
      ) : null}
      <div className="t-small c-ink-2 flex flex-wrap justify-between gap-3">
        {due && c ? (
          <p>
            Content due {shortDate(due)}{' '}
            <span className={c.overdue ? 'text-danger' : 'c-ink-3'}>{c.text}</span>
          </p>
        ) : null}
        {deal.creatorAmountPaise !== null ? (
          <p>
            You receive <Money paise={deal.creatorAmountPaise} size="s" />
          </p>
        ) : null}
      </div>
    </article>
  );
}

function DoneRow({ deal }: { deal: DealMineItem }) {
  const cancelled = deal.status === 'CANCELLED';
  const when = cancelled ? deal.cancelledAt : deal.completedAt;
  return (
    <li className="grid gap-3 border-t border-border px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,2fr)_130px_130px_minmax(0,1.3fr)] md:items-center md:gap-5 md:px-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link href={`/deals/${deal.id}`} className="t-body">
          {deal.title}
        </Link>
        <UserChip username={deal.brand.username} src={deal.brand.profilePictureUrl} />
      </div>
      <p className="t-small c-ink-2">{when ? formatFullDayTime(when).split(',')[0] : ''}</p>
      <p>
        <Money paise={deal.receivedPaise ?? 0} size="s" />
      </p>
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={deal.status} />
        {cancelled ? (
          <p className="t-small c-ink-2">
            {deal.cancelledByRole === 'ADMIN'
              ? 'Cancelled by ValueSkins.'
              : 'Cancelled by the brand.'}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** `/my-deals` (CrMyDeals, CrMyDealsDone): Active and Completed. Cancelled deals sit under Completed. */
export function MyDealsPage() {
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const active = useMyDeals(ACTIVE_STATUSES);
  const done = useMyDeals(DONE_STATUSES);
  const list = tab === 'active' ? active : done;
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const count = (q: typeof active) =>
    q.data && !q.hasNextPage ? q.data.pages.flatMap((p) => p.items).length : null;
  const completed = items.filter((d) => d.status === 'COMPLETED');
  const received = completed.reduce((sum, d) => sum + (d.receivedPaise ?? 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div className="flex flex-col gap-1.5">
          <h1 className="t-h1">My deals</h1>
          <p className="t-body c-ink-2">Deals a brand confirmed you on.</p>
        </div>
      </div>
      <Tabs
        label="My deals"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'active', label: 'Active', count: count(active) },
          { id: 'done', label: 'Completed', count: count(done) },
        ]}
      />
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {list.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : list.isError ? (
          <Callout tone="error" title="We could not load your deals" role="alert">
            <p>{errorText(list.error)}</p>
          </Callout>
        ) : items.length === 0 ? (
          tab === 'active' ? (
            <EmptyState
              title="No active deals"
              text="When a brand confirms you on a deal, it shows here with the one thing to do next."
            >
              <Link href="/deals" className="btn btn-secondary">
                See open deals
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              title="Nothing completed yet"
              text="Finished and cancelled deals show here, with their deal record."
            />
          )
        ) : tab === 'active' ? (
          <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6">
            {items.map((d) => (
              <ActiveCard key={d.id} deal={d} />
            ))}
          </div>
        ) : (
          <>
            {!list.hasNextPage && completed.length ? (
              <p className="t-small c-ink-2 mb-3">
                <span className="money">{formatInr(received)}</span> received across{' '}
                {completed.length} completed {completed.length === 1 ? 'deal' : 'deals'}.
              </p>
            ) : null}
            <div className="card overflow-hidden">
              <ul className="m-0 list-none p-0">
                {items.map((d) => (
                  <DoneRow key={d.id} deal={d} />
                ))}
              </ul>
            </div>
          </>
        )}
        <ShowMore
          hasMore={Boolean(list.hasNextPage)}
          loading={list.isFetchingNextPage}
          onMore={() => void list.fetchNextPage()}
          label="Show more deals"
        />
      </div>
    </div>
  );
}
