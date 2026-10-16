'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DEAL_STATUSES, formatInr, type DealStatus } from '@valueskins/shared';
import { useAdminDeals, type AdminDealFilter, type AdminDealItem } from '@/lib/api/admin';
import { STATUS_LABEL } from '@/lib/dealStatus';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { LoadError } from '@/components/ui/LoadError';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/deal/StatusBadge';
import { Pager, useCursorPages } from './Pager';

const SHORT_ID_MAX = 8;
const DEBOUNCE_MS = 300;

function isStatus(value: string | null | undefined): value is DealStatus {
  return Boolean(value) && (DEAL_STATUSES as readonly string[]).includes(value!);
}

/** Short ids are letters and digits; anything else is dropped as it is typed. */
export function cleanShortId(value: string): string {
  return value
    .replace(/[^0-9a-z]/gi, '')
    .toUpperCase()
    .slice(0, SHORT_ID_MAX);
}

function Flags({ deal }: { deal: AdminDealItem }) {
  const flags: Array<[string, 'error' | 'wait']> = [];
  if (deal.hasOpenDispute) flags.push(['Open dispute', 'error']);
  if (deal.contentOverdue) flags.push(['Content overdue', 'wait']);
  if (deal.awaitingConfirmation) flags.push(['Waiting for creator', 'wait']);
  if (!flags.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {flags.map(([text, kind]) => (
        <Badge key={text} kind={kind}>
          {text}
        </Badge>
      ))}
    </div>
  );
}

function Rows({ items }: { items: AdminDealItem[] }) {
  return (
    <div className="dt-wrap" tabIndex={0}>
      <table className="dt dt-stack">
        <thead>
          <tr>
            <th scope="col" className="w-[120px]">
              Id
            </th>
            <th scope="col">Deal</th>
            <th scope="col" className="w-[170px]">
              Status
            </th>
            <th scope="col" className="w-[170px]">
              Brand
            </th>
            <th scope="col" className="w-[160px]">
              Creator
            </th>
            <th scope="col" className="w-[130px] text-right">
              Budget
            </th>
            <th scope="col" className="w-[120px]">
              Created
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id}>
              <td className="idc" data-label="Id">
                {d.shortId}
              </td>
              <td data-label="Deal">
                <Link href={`/admin/deals/${d.id}`} className="ttl">
                  {d.title ?? 'Untitled draft'}
                </Link>
                <Flags deal={d} />
              </td>
              <td data-label="Status">
                <StatusBadge status={d.status} />
              </td>
              <td data-label="Brand">@{d.brand.username}</td>
              <td data-label="Creator" className={d.creator ? undefined : 'c-ink-3'}>
                {d.creator ? `@${d.creator.username}` : 'Not confirmed'}
              </td>
              <td className="num" data-label="Budget">
                {d.budgetPaise !== null ? formatInr(d.budgetPaise) : 'Not set'}
              </td>
              <td className="c-ink-2" data-label="Created">
                {formatDate(d.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingRows() {
  return (
    <div aria-busy="true" aria-label="Loading deals">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-rule px-6 py-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="hidden h-3 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

/** `/admin/deals` (AdDeals, AdDealsEmpty): every deal, newest first, drafts included. */
export function AdminDealsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const urlStatus = params?.get('status');
  const filter: AdminDealFilter = {
    status: isStatus(urlStatus) ? urlStatus : '',
    q: cleanShortId(params?.get('q') ?? ''),
  };
  const [text, setText] = useState(filter.q);
  const pages = useCursorPages();
  const { reset } = pages;
  const list = useAdminDeals(filter, pages.cursor);

  const setFilter = (next: AdminDealFilter) => {
    const search = new URLSearchParams();
    if (next.status) search.set('status', next.status);
    if (next.q) search.set('q', next.q);
    const qs = search.toString();
    reset();
    router.replace(qs ? `/admin/deals?${qs}` : '/admin/deals');
  };

  // The short id search runs a moment after typing stops.
  useEffect(() => {
    if (text === filter.q) return;
    const timer = setTimeout(() => setFilter({ ...filter, q: text }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const filtered = Boolean(filter.q || filter.status);
  const clear = () => {
    setText('');
    setFilter({ status: '', q: '' });
  };
  const items = list.data?.items ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div className="flex flex-col gap-1.5">
          <h1 className="t-h1">Deals</h1>
          <p className="t-body c-ink-2">Every deal on ValueSkins, newest first, drafts included.</p>
        </div>
      </div>

      <form
        role="search"
        aria-label="Filter deals"
        className="mb-5 flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter({ ...filter, q: text });
        }}
      >
        <Field id="adm-status" label="Status" className="w-full md:w-60">
          <Select
            id="adm-status"
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value as DealStatus | '' })}
          >
            <option value="">All statuses</option>
            {DEAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="adm-id"
          label="Short id"
          help="The first letters are enough. Any case."
          className="w-full md:w-[280px]"
        >
          <Input
            id="adm-id"
            mono
            value={text}
            maxLength={SHORT_ID_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder="8K2M4QXZ"
            aria-describedby="adm-id-help"
            onChange={(e) => setText(cleanShortId(e.target.value))}
          />
        </Field>
        {filtered ? (
          <Button variant="text" className="md:mb-7" onClick={clear}>
            Clear
          </Button>
        ) : null}
      </form>

      {list.isError ? (
        <LoadError
          title="We could not load the deals"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <section className="card overflow-hidden" aria-label="Deals">
          {!list.data ? (
            <LoadingRows />
          ) : items.length ? (
            <>
              <Rows items={items} />
              <Pager
                page={pages.page}
                summary={`Page ${pages.page}. ${items.length} ${items.length === 1 ? 'deal' : 'deals'} on this page, ${list.data.total} in all.`}
                nextCursor={list.data.nextCursor}
                noun="deals"
                onPrev={pages.prev}
                onNext={pages.next}
              />
            </>
          ) : (
            <div className="flex flex-col items-start gap-2.5 px-6 py-12 md:px-8">
              <h2 className="t-h3">
                {filter.q
                  ? `No deals start with ${filter.q}`
                  : filter.status
                    ? 'No deals with this status'
                    : 'No deals yet'}
              </h2>
              <p className="t-small c-ink-2 max-w-[56ch]">
                {filter.q
                  ? 'Check the id on the email or the PDF. It has 8 letters and digits, like 8K2M4QXZ.'
                  : filter.status
                    ? 'Pick another status, or clear the filter to see every deal.'
                    : 'Deals show here as soon as a brand saves one.'}
              </p>
              {filtered ? (
                <Button variant="secondary" className="mt-1.5" onClick={clear}>
                  Clear search
                </Button>
              ) : null}
            </div>
          )}
        </section>
      )}
      <p className="t-small c-ink-2 mt-3">
        Open dispute and Content overdue marks help to pick what to look at first.
      </p>
    </div>
  );
}
