'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DisputeStatus } from '@valueskins/shared';
import { useAdminDisputes, type AdminDispute } from '@/lib/api/admin';
import { formatFullDayTime } from '@/lib/dealFormat';
import { LoadError } from '@/components/ui/LoadError';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/lists/Tabs';
import { DisputeBadge } from './AdminDealPage';
import { Pager, useCursorPages } from './Pager';

const PREVIEW_MAX = 110;

function preview(d: AdminDispute): string {
  const text =
    d.status === 'RESOLVED' && d.resolution ? `Resolved: ${d.resolution}` : d.description;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_MAX ? `${flat.slice(0, PREVIEW_MAX).trimEnd()}...` : flat;
}

function Rows({ items, resolved }: { items: AdminDispute[]; resolved: boolean }) {
  return (
    <table className="dt dt-stack">
      <thead>
        <tr>
          <th scope="col">Dispute</th>
          <th scope="col" className="w-[300px]">
            Deal
          </th>
          <th scope="col" className="w-[210px]">
            Raised by
          </th>
          <th scope="col" className="w-[170px]">
            {resolved ? 'Resolved' : 'Raised'}
          </th>
          <th scope="col" className="w-[120px]">
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((d) => (
          <tr key={d.id}>
            <td data-label="Dispute">
              <Link href={`/admin/disputes/${d.id}`} className="ttl">
                {d.subject}
              </Link>
              <p className="rec-sub mt-1">{preview(d)}</p>
            </td>
            <td data-label="Deal">
              <p className="t-mono text-[13px]">{d.dealShortId}</p>
              <p>{d.dealTitle ?? 'Untitled deal'}</p>
            </td>
            <td data-label="Raised by">
              <p>@{d.raisedBy.username}</p>
              <p className="rec-sub">{d.raisedBy.role === 'BRAND' ? 'Brand' : 'Creator'}</p>
            </td>
            <td className="c-ink-2" data-label={resolved ? 'Resolved' : 'Raised'}>
              {formatFullDayTime(resolved && d.resolvedAt ? d.resolvedAt : d.createdAt)}
            </td>
            <td data-label="Status">
              <DisputeBadge dispute={d} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `/admin/disputes` (AdDisputes): open and resolved disputes, newest first. */
export function AdminDisputesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const status: DisputeStatus = params?.get('status') === 'RESOLVED' ? 'RESOLVED' : 'OPEN';
  const resolved = status === 'RESOLVED';
  const pages = useCursorPages();
  const list = useAdminDisputes(status, pages.cursor);
  const items = list.data?.items ?? [];

  const setTab = (next: DisputeStatus) => {
    pages.reset();
    router.replace(next === 'RESOLVED' ? '/admin/disputes?status=RESOLVED' : '/admin/disputes');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="flex flex-col gap-1.5">
          <h1 className="t-h1">Disputes</h1>
          <p className="t-body c-ink-2">
            Raised by a brand or a creator on a deal. Resolving one emails both sides and does not
            change the deal.
          </p>
        </div>
      </div>

      <Tabs
        label="Disputes"
        value={status}
        onChange={setTab}
        items={[
          { id: 'OPEN', label: 'Open' },
          { id: 'RESOLVED', label: 'Resolved' },
        ]}
      />

      <section
        className="card overflow-hidden"
        role="tabpanel"
        id={`panel-${status}`}
        aria-labelledby={`tab-${status}`}
      >
        {list.isError ? (
          <LoadError
            className="p-6"
            title="We could not load the disputes"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : !list.data ? (
          <div aria-busy="true" aria-label="Loading disputes">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-rule px-6 py-4">
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : items.length ? (
          <>
            <Rows items={items} resolved={resolved} />
            <Pager
              page={pages.page}
              summary="Newest first."
              nextCursor={list.data.nextCursor}
              noun="disputes"
              onPrev={pages.prev}
              onNext={pages.next}
            />
          </>
        ) : (
          <div className="flex flex-col items-start gap-2.5 px-6 py-12 md:px-8">
            <h2 className="t-h3">{resolved ? 'No resolved disputes yet' : 'No open disputes'}</h2>
            <p className="t-small c-ink-2">
              {resolved
                ? 'Disputes you mark resolved are kept here.'
                : 'When a brand or a creator raises one, it shows up here and we get an email.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
