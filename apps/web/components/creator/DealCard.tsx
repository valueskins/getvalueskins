'use client';

import Link from 'next/link';
import type { DealFeedItem } from '@valueskins/shared';
import { formatInr } from '@valueskins/shared';
import { closingToday, isNew, shortDate } from '@/lib/deadlines';
import { Badge } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { Money } from '@/components/ui/Money';
import { ResumeCard } from '@/components/resume/ResumeCard';
import { useNow } from '@/components/deal/useNow';

/** One open deal in the feed (CrFeed). The title link covers the card; the brand chip opens the resume. */
export function DealCard({ deal, href }: { deal: DealFeedItem; href: string }) {
  const now = useNow();
  const closing = deal.applicationDeadline ? closingToday(deal.applicationDeadline, now) : null;
  return (
    <article className="card deal-card flex flex-col gap-3.5 px-4 py-4 md:px-6 md:py-5">
      <div className="above flex items-center justify-between gap-2">
        <ResumeCard
          userId={deal.brand.id}
          username={deal.brand.username}
          profilePictureUrl={deal.brand.profilePictureUrl}
        />
        <div className="flex items-center gap-1.5">
          {deal.applied ? (
            <Badge kind="ok">
              <Icon name="check" />
              Applied
            </Badge>
          ) : null}
          {isNew(deal.publishedAt, now) ? <Badge kind="new">New</Badge> : null}
        </div>
      </div>
      <h2 className="t-h3">
        <Link href={href} className="stretched">
          {deal.title}
        </Link>
      </h2>
      <p className="t-small c-ink-2 line-clamp-2">{deal.description}</p>
      <div className="hr" />
      <div className="flex flex-col gap-1.5">
        {deal.budgetPaise !== null ? (
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-small c-ink-2">Budget</p>
            <Money paise={deal.budgetPaise} size="s" />
          </div>
        ) : null}
        {deal.creatorAmountPaise !== null ? (
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-small font-medium">You receive</p>
            <Money paise={deal.creatorAmountPaise} size="m" />
          </div>
        ) : null}
        {deal.advancePaise !== null && deal.finalPaise !== null ? (
          <p className="money money-s c-ink-3 text-right">
            ({formatInr(deal.advancePaise)} + {formatInr(deal.finalPaise)})
          </p>
        ) : null}
      </div>
      <div className="t-small c-ink-2 flex flex-wrap items-center gap-4">
        {deal.applicationDeadline ? (
          <span>Apply by {shortDate(deal.applicationDeadline)}</span>
        ) : null}
        {deal.contentUploadDeadline ? (
          <span>Content due {shortDate(deal.contentUploadDeadline)}</span>
        ) : null}
      </div>
      {closing ? (
        <Badge kind="wait" className="self-start">
          <Icon name="clock" />
          {closing}
        </Badge>
      ) : null}
    </article>
  );
}
