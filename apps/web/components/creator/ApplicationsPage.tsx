'use client';

import Link from 'next/link';
import type { MyApplicationItem } from '@valueskins/shared';
import { useMyApplications } from '@/lib/api/deals';
import { errorText } from '@/lib/api/errors';
import { countdown, longDate } from '@/lib/deadlines';
import { formatFullDayTime } from '@/lib/dealFormat';
import { Badge, Callout, type BadgeKind } from '@/components/ui/Callout';
import { Money } from '@/components/ui/Money';
import { Skeleton } from '@/components/ui/Skeleton';
import { UserChip } from '@/components/ui/Avatar';
import { useNow } from '@/components/deal/useNow';
import { EmptyState } from '@/components/lists/EmptyState';
import { ShowMore } from '@/components/lists/ShowMore';

interface RowView {
  label: string;
  kind: BadgeKind;
  note: string;
  link: { href: string; text: string } | null;
}

/**
 * What a row says. The deal page answers 404 to an applicant once the deal is
 * no longer open, unless they were confirmed, so only those rows link.
 */
export function applicationView(a: MyApplicationItem, now: Date): RowView {
  if (a.status === 'CONFIRMED' && a.deal.status === 'CANCELLED') {
    // The confirmed creator can still open a cancelled deal and its records.
    return {
      label: 'Deal cancelled',
      kind: 'cancelled',
      note: 'This deal was cancelled. You can still open it.',
      link: { href: `/deals/${a.deal.id}`, text: 'Go to deal' },
    };
  }
  if (a.status === 'CONFIRMED') {
    return {
      label: 'Confirmed',
      kind: 'ok',
      note: 'You are on this deal.',
      link: { href: `/deals/${a.deal.id}`, text: 'Go to deal' },
    };
  }
  if (a.status === 'REJECTED') {
    return {
      label: 'Not selected',
      kind: 'draft',
      note: 'The brand picked another creator.',
      link: null,
    };
  }
  if (a.deal.status === 'CANCELLED') {
    return {
      label: 'Deal cancelled',
      kind: 'cancelled',
      note: 'The brand cancelled this deal, so it is no longer shown.',
      link: null,
    };
  }
  if (a.deal.status !== 'OPEN') {
    return {
      label: 'Not selected',
      kind: 'draft',
      note: 'The brand picked another creator.',
      link: null,
    };
  }
  const closed = a.deal.applicationDeadline
    ? countdown(a.deal.applicationDeadline, now).overdue
    : false;
  return {
    label: 'Applied',
    kind: 'progress',
    note:
      closed && a.deal.applicationDeadline
        ? `Applications closed on ${longDate(a.deal.applicationDeadline)}. The brand can still pick.`
        : 'Waiting for the brand to pick a creator.',
    link: { href: `/deals/${a.deal.id}`, text: 'View deal' },
  };
}

/** `/applications` (CrApplications). */
export function ApplicationsPage() {
  const list = useMyApplications();
  const now = useNow();
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="page">
      <div className="page-head">
        <div className="flex flex-col gap-1.5">
          <h1 className="t-h1">Applications</h1>
          <p className="t-body c-ink-2">
            Every deal you applied to, newest first. An application cannot be withdrawn.
          </p>
        </div>
      </div>
      {list.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : list.isError ? (
        <Callout tone="error" title="We could not load your applications" role="alert">
          <p>{errorText(list.error)}</p>
        </Callout>
      ) : items.length === 0 ? (
        <EmptyState
          title="No applications yet"
          text="Apply to an open deal and it shows here, with what the brand decided."
        >
          <Link href="/deals" className="btn btn-secondary">
            See open deals
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div
              className="hidden gap-5 border-b border-rule px-6 py-2.5 md:grid md:grid-cols-[minmax(0,2fr)_120px_120px_minmax(0,1.4fr)_120px]"
              aria-hidden="true"
            >
              <p className="t-label c-ink-2">Deal</p>
              <p className="t-label c-ink-2">Applied</p>
              <p className="t-label c-ink-2">You receive</p>
              <p className="t-label c-ink-2">Status</p>
              <span />
            </div>
            <ul className="m-0 list-none p-0">
              {items.map((a) => {
                const v = applicationView(a, now);
                return (
                  <li
                    key={a.id}
                    className="grid gap-3 border-t border-rule px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,2fr)_120px_120px_minmax(0,1.4fr)_120px] md:items-center md:gap-5 md:px-6"
                  >
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <p className="t-body">{a.deal.title}</p>
                      <UserChip
                        username={a.deal.brand.username}
                        src={a.deal.brand.profilePictureUrl}
                      />
                    </div>
                    <p className="t-small c-ink-2">
                      {formatFullDayTime(a.createdAt).split(',')[0]}
                    </p>
                    <p>
                      {a.deal.creatorAmountPaise !== null ? (
                        <Money paise={a.deal.creatorAmountPaise} size="s" />
                      ) : null}
                    </p>
                    <div className="flex flex-col items-start gap-1">
                      <Badge kind={v.kind}>{v.label}</Badge>
                      <p className="t-small c-ink-2">{v.note}</p>
                    </div>
                    <div>
                      {v.link ? (
                        <Link href={v.link.href} className="btn btn-secondary btn-sm">
                          {v.link.text}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <ShowMore
            hasMore={Boolean(list.hasNextPage)}
            loading={list.isFetchingNextPage}
            onMore={() => void list.fetchNextPage()}
            label="Show more applications"
          />
        </>
      )}
    </div>
  );
}
