'use client';

import { notFound, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ApiError } from '@/lib/api/client';
import { useDeal } from '@/lib/api/deals';
import { errorText } from '@/lib/api/errors';
import { Callout } from '@/components/ui/Callout';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { DealForm } from './DealForm';

/** A draft opens in the form. Anything already published goes to its deal page. */
export function EditDraftPage({ id }: { id: string }) {
  const router = useRouter();
  const deal = useDeal(id);
  const published = deal.data && deal.data.status !== 'DRAFT';
  useEffect(() => {
    if (published) router.replace(`/deals/${id}`);
  }, [published, id, router]);

  if (deal.error instanceof ApiError && deal.error.status === 404) notFound();
  if (deal.isError) {
    return (
      <div className="page">
        <Callout tone="error" title="We could not load this draft" role="alert">
          <p>{errorText(deal.error)}</p>
        </Callout>
      </div>
    );
  }
  if (!deal.data || published) return <PageSkeleton />;
  return <DealForm key={deal.data.id} draft={deal.data} />;
}
