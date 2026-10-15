'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { dealKeys, useFeed } from '@/lib/api/deals';
import { usePayoutUpi } from '@/lib/api/queries';
import { errorText } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useRealtime } from '@/components/realtime/RealtimeProvider';
import { EmptyState } from '@/components/lists/EmptyState';
import { ShowMore } from '@/components/lists/ShowMore';
import { DealCard } from './DealCard';

/** `/deals`: every open deal, newest first (CrFeed, CrFeedNoUpi, CrFeedEmpty). */
export function FeedPage() {
  const feed = useFeed();
  const upi = usePayoutUpi(true);
  const client = useQueryClient();
  const { newDeals, clearNewDeals } = useRealtime();
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const noUpi = upi.isSuccess && upi.data.payoutUpi === null;

  return (
    <div className="page">
      <div className="page-head">
        <div className="flex flex-col gap-1.5">
          <h1 className="t-h1">Deals</h1>
          <p className="t-body c-ink-2">
            Open deals from brands, newest first. Every amount is fixed by the brand.
          </p>
        </div>
      </div>

      {newDeals > 0 ? (
        <div className="-mt-2 mb-4 flex justify-center" role="status">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              clearNewDeals();
              void client.resetQueries({ queryKey: dealKeys.feed });
            }}
          >
            {newDeals === 1 ? '1 new deal' : `${newDeals} new deals`}
          </Button>
        </div>
      ) : null}

      {noUpi ? (
        <div className="banner mb-6" role="status">
          <div className="flex items-start gap-3">
            <Icon name="warning" />
            <div>
              <p className="t-body font-semibold">Add your UPI ID to apply</p>
              <p className="t-small">
                Brands pay you directly by UPI, so you need one saved before you apply. You can
                browse every deal until then.
              </p>
            </div>
          </div>
          <Link href="/settings#upi" className="btn btn-primary">
            Add UPI ID
          </Link>
        </div>
      ) : null}

      {feed.isPending ? (
        <div
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Loading deals"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : feed.isError ? (
        <Callout tone="error" title="We could not load the deals" role="alert">
          <p>{errorText(feed.error)}</p>
        </Callout>
      ) : items.length === 0 ? (
        <EmptyState
          title="No open deals right now"
          text="New deals show up here as soon as a brand posts one. This page updates on its own, so you can leave it open."
        >
          <Link href="/applications" className="btn btn-secondary">
            See your applications
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {items.map((d) => (
              <DealCard key={d.id} deal={d} href={`/deals/${d.id}`} />
            ))}
          </div>
          <ShowMore
            hasMore={Boolean(feed.hasNextPage)}
            loading={feed.isFetchingNextPage}
            onMore={() => void feed.fetchNextPage()}
            label="Show more deals"
          />
        </>
      )}
    </div>
  );
}
