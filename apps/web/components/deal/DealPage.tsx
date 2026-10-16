'use client';

import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DealDetail, MeResponse } from '@valueskins/shared';
import { ApiError } from '@/lib/api/client';
import { useDeal, useDealEmails, useDealEvents } from '@/lib/api/deals';
import { useMe } from '@/lib/api/queries';
import { dealSteps } from '@/lib/dealStatus';
import { formatFullDayTime } from '@/lib/dealFormat';
import { viewerOf, type Viewer } from '@/lib/dealView';
import { LoadError } from '@/components/ui/LoadError';
import { Icon } from '@/components/ui/Icon';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ResumeCard } from '@/components/resume/ResumeCard';
import { useDealRoom } from '@/components/realtime/RealtimeProvider';
import { DealSteps } from './DealSteps';
import { CancelModal, DisputeModal } from './DealModals';
import { NextStep } from './NextStep';
import {
  ActivitySection,
  BriefSection,
  DocumentsSection,
  EmailsSection,
  FeedbackSection,
  LinksSection,
  PaymentsSection,
} from './Sections';
import { SidePanel } from './SidePanel';
import { StatusBadge } from './StatusBadge';

function crumb(viewer: Viewer): { href: string; label: string } {
  if (viewer === 'brand') return { href: '/campaigns', label: 'Campaigns' };
  if (viewer === 'creator') return { href: '/my-deals', label: 'My deals' };
  return { href: '/deals', label: 'All deals' };
}

function Header({ deal, viewer }: { deal: DealDetail; viewer: Viewer }) {
  const c = crumb(viewer);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3">
        <Link href={c.href} className="t-small inline-flex min-h-8 items-center gap-1.5">
          <Icon name="arrowRight" size={16} className="rotate-180" />
          {c.label}
        </Link>
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="m-0 text-[26px] font-semibold leading-[32px] tracking-[-0.015em] md:text-[34px] md:leading-[40px]">
            {deal.title ?? 'Untitled deal'}
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <StatusBadge status={deal.status} />
            <span className="t-mono t-small c-ink-3">{deal.shortId}</span>
            {deal.publishedAt ? (
              <span className="t-small c-ink-2">Posted {formatFullDayTime(deal.publishedAt)}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-7">
          <div className="flex flex-col gap-1">
            <p className="t-label c-ink-2">Brand</p>
            <ResumeCard
              userId={deal.brand.id}
              username={deal.brand.username}
              profilePictureUrl={deal.brand.profilePictureUrl}
            />
          </div>
          <div className="flex flex-col gap-1">
            <p className="t-label c-ink-2">Creator</p>
            {deal.creator ? (
              <ResumeCard
                userId={deal.creator.id}
                username={deal.creator.username}
                profilePictureUrl={deal.creator.profilePictureUrl}
              />
            ) : (
              <p className="t-small c-ink-2 flex min-h-8 items-center">Not confirmed yet</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function DealView({ deal, me }: { deal: DealDetail; me: MeResponse }) {
  const viewer = viewerOf(deal, me);
  const party = viewer !== 'other';
  const events = useDealEvents(deal.id, party);
  const emails = useDealEmails(deal.id, party);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  useDealRoom(deal.id, party);
  const eventsFailed = events.isError
    ? { error: events.error, retry: () => void events.refetch() }
    : undefined;
  const emailsFailed = emails.isError
    ? { error: emails.error, retry: () => void emails.refetch() }
    : undefined;

  return (
    <div className="page">
      <Header deal={deal} viewer={viewer} />
      <section className="card card-pad mb-6" aria-label="Deal progress">
        <DealSteps steps={dealSteps(deal)} />
      </section>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <NextStep deal={deal} viewer={viewer} onDispute={() => setDisputeOpen(true)} />
          <BriefSection deal={deal} defaultOpen={viewer === 'other' || deal.status === 'OPEN'} />
          {party ? (
            <>
              <LinksSection deal={deal} />
              <FeedbackSection deal={deal} />
              <PaymentsSection deal={deal} viewer={viewer} />
              <DocumentsSection deal={deal} />
              <EmailsSection emails={emails.data} failed={emailsFailed} />
              <ActivitySection deal={deal} events={events.data} failed={eventsFailed} />
            </>
          ) : null}
        </div>
        <SidePanel
          deal={deal}
          viewer={viewer}
          onCancel={() => setCancelOpen(true)}
          onDispute={() => setDisputeOpen(true)}
        />
      </div>
      <CancelModal deal={deal} open={cancelOpen} onClose={() => setCancelOpen(false)} />
      <DisputeModal deal={deal} open={disputeOpen} onClose={() => setDisputeOpen(false)} />
    </div>
  );
}

/** `/deals/[id]`: one layout for every state and both roles, driven by allowedActions. */
export function DealPage({ id }: { id: string }) {
  const router = useRouter();
  const me = useMe();
  const deal = useDeal(id);
  const isDraft = deal.data?.status === 'DRAFT';

  useEffect(() => {
    if (isDraft) router.replace(`/campaigns/${id}/edit`);
  }, [isDraft, id, router]);

  if (deal.error instanceof ApiError && deal.error.status === 404) notFound();
  if (deal.isError) {
    return (
      <LoadError
        className="page"
        title="We could not load this deal"
        error={deal.error}
        onRetry={() => void deal.refetch()}
      />
    );
  }
  if (!deal.data || !me.data || isDraft) return <PageSkeleton />;
  return <DealView deal={deal.data} me={me.data} />;
}
