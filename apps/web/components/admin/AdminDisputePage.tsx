'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useState } from 'react';
import {
  DISPUTE_TEXT_MAX,
  REFUND_REFERENCE_MAX,
  formatInr,
  type DealDetail,
} from '@valueskins/shared';
import { ApiError } from '@/lib/api/client';
import {
  useAdminDeal,
  useAdminDispute,
  useResolveDispute,
  type AdminDispute,
} from '@/lib/api/admin';
import { errorText, isApiError } from '@/lib/api/errors';
import { formatFullDayTime, formatShortDateTime } from '@/lib/dealFormat';
import { at } from '@/lib/dealView';
import { longDate } from '@/lib/deadlines';
import { Button, LinkButton } from '@/components/ui/Button';
import { Badge, Callout } from '@/components/ui/Callout';
import { describedBy, Field, Input, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { LoadError } from '@/components/ui/LoadError';
import { PageSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { StatusBadge } from '@/components/deal/StatusBadge';
import { DisputeBadge, roleWord } from './AdminDealPage';

function ResolveForm({ dispute }: { dispute: AdminDispute }) {
  const resolve = useResolveDispute(dispute.id);
  const toast = useToast();
  const [text, setText] = useState('');
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) {
      setError('Write the resolution. Both sides will read it.');
      return;
    }
    setError(null);
    try {
      await resolve.mutateAsync({
        resolution: text.trim(),
        ...(ref.trim() ? { refundReference: ref.trim() } : {}),
      });
      toast.show({
        tone: 'ok',
        title: 'Dispute resolved',
        text: 'Both sides were emailed. The deal did not change.',
      });
    } catch (err) {
      if (isApiError(err, 'DISPUTE_ALREADY_RESOLVED')) {
        toast.show({
          tone: 'error',
          title: 'This dispute was already resolved',
          text: 'We reloaded it so you see the resolution.',
        });
        return;
      }
      toast.show({ tone: 'error', title: errorText(err) });
    }
  };

  return (
    <section className="sec border-ink" aria-labelledby="res-h">
      <div className="sec-h">
        <h2 id="res-h" className="t-h3">
          Mark resolved
        </h2>
      </div>
      <div className="sec-b flex flex-col gap-4 px-4 pb-6 pt-5 md:px-6">
        <Field
          id="rs-note"
          label="Resolution"
          help="Both sides will be emailed. They see this text as it is."
          error={error}
          aside={
            <span className="counter">
              {text.length} / {DISPUTE_TEXT_MAX}
            </span>
          }
        >
          <Textarea
            id="rs-note"
            value={text}
            maxLength={DISPUTE_TEXT_MAX}
            invalid={Boolean(error)}
            placeholder="What was decided, and what each side does next"
            className="min-h-[140px]"
            aria-describedby={describedBy('rs-note', true, error)}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
        <Field
          id="rs-ref"
          label="Refund reference"
          optional
          help="Only if you refunded the fee in Razorpay. It goes in the email."
          className="max-w-[420px]"
        >
          <Input
            id="rs-ref"
            mono
            value={ref}
            maxLength={REFUND_REFERENCE_MAX}
            placeholder="rfnd_..."
            aria-describedby="rs-ref-help"
            onChange={(e) => setRef(e.target.value)}
          />
        </Field>
        <Callout>
          <p>
            Resolving does not change the deal. To stop the deal, cancel it from the{' '}
            <Link href={`/admin/deals/${dispute.dealId}`}>deal page</Link>.
          </p>
        </Callout>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={resolve.isPending} onClick={() => void submit()}>
            Mark resolved
          </Button>
          <p className="t-small c-ink-2">Both sides will be emailed.</p>
        </div>
      </div>
    </section>
  );
}

function Resolution({ dispute }: { dispute: AdminDispute }) {
  return (
    <section className="sec" aria-labelledby="done-h">
      <div className="sec-h">
        <h2 id="done-h" className="t-h3">
          Resolution
        </h2>
        {dispute.resolvedAt ? (
          <Badge kind="ok">Resolved {formatFullDayTime(dispute.resolvedAt)}</Badge>
        ) : null}
      </div>
      <div className="sec-b flex flex-col gap-3 px-4 py-4 md:px-6">
        <div className="quote">{dispute.resolution}</div>
        <dl className="kv">
          <dt>Refund reference</dt>
          <dd>
            <span className="t-mono text-[13px]">{dispute.refundReference ?? 'None'}</span>
          </dd>
          <dt>Resolved by</dt>
          <dd>{dispute.resolvedBy ? at(dispute.resolvedBy.username) : 'Not recorded'}</dd>
        </dl>
        <div>
          <Button variant="secondary" disabledReason="This dispute is already resolved">
            Mark resolved
          </Button>
        </div>
      </div>
    </section>
  );
}

/** "₹885.00, paid 2 Oct", or what is still to come. */
function moneyRow(paise: number | null, doneAt: string | null, word: string, pending: string) {
  return {
    amount: paise !== null ? formatInr(paise) : null,
    tail: doneAt ? `${word} ${formatShortDateTime(doneAt)}` : pending,
  };
}

function DealCard({ deal }: { deal: DealDetail }) {
  const cancelled = deal.status === 'CANCELLED';
  const later = cancelled ? 'not paid' : 'not due';
  const rows = [
    {
      label: 'Fee',
      ...moneyRow(
        deal.commissionTotalPaise,
        deal.commissionPaidAt,
        'paid',
        cancelled ? 'not charged' : 'not paid',
      ),
    },
    { label: 'Advance', ...moneyRow(deal.advancePaise, deal.advancePaidAt, 'confirmed', later) },
    { label: 'Final', ...moneyRow(deal.finalPaise, deal.completedAt, 'confirmed', later) },
  ];
  return (
    <section className="card" aria-labelledby="deal-h">
      <div className="flex flex-col gap-1.5 px-5 py-4">
        <p className="t-label c-ink-2" id="deal-h">
          The deal
        </p>
        <p className="t-h3">{deal.title ?? 'Untitled deal'}</p>
        <div className="flex items-center gap-2.5">
          <StatusBadge status={deal.status} />
          <span className="t-mono t-small c-ink-3">{deal.shortId}</span>
        </div>
      </div>
      <div className="hr" />
      <div className="px-5 py-3.5">
        <dl className="kv md:!grid-cols-[110px_minmax(0,1fr)]">
          <dt>Brand</dt>
          <dd>{at(deal.brand.username)}</dd>
          <dt>Creator</dt>
          <dd>{deal.creator ? at(deal.creator.username) : 'Not confirmed'}</dd>
          <dt>Budget</dt>
          <dd>
            {deal.budgetPaise !== null ? (
              <span className="money">{formatInr(deal.budgetPaise)}</span>
            ) : (
              'Not set'
            )}
          </dd>
          {rows.map(({ label, amount, tail }) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd>
                {amount ? <span className="money">{amount}</span> : null}
                {amount ? ', ' : ''}
                {tail}
              </dd>
            </div>
          ))}
          <dt>Content due</dt>
          <dd>{deal.contentUploadDeadline ? longDate(deal.contentUploadDeadline) : 'Not set'}</dd>
        </dl>
      </div>
      <div className="hr" />
      <div className="px-5 py-3.5">
        <LinkButton href={`/admin/deals/${deal.id}`} variant="secondary" block>
          Open the deal
        </LinkButton>
      </div>
    </section>
  );
}

function Side({ dispute }: { dispute: AdminDispute }) {
  const deal = useAdminDeal(dispute.dealId);
  if (deal.isError) {
    return (
      <LoadError
        title="We could not load the deal"
        error={deal.error}
        onRetry={() => void deal.refetch()}
      />
    );
  }
  if (!deal.data) return <Skeleton className="h-64 w-full" />;
  const others = deal.data.disputes.filter((d) => d.id !== dispute.id);
  return (
    <>
      <DealCard deal={deal.data.deal} />
      <section className="card card-pad flex flex-col gap-1.5">
        <p className="t-small font-medium">Other disputes on this deal</p>
        {others.length ? (
          <ul className="flex flex-col gap-2">
            {others.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <Link href={`/admin/disputes/${d.id}`} className="t-small">
                  {d.subject}
                </Link>
                <DisputeBadge dispute={d} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-small c-ink-2">None.</p>
        )}
      </section>
    </>
  );
}

/** `/admin/disputes/[id]` (AdDispute, AdDisputeResolved): read it, then mark it resolved. */
export function AdminDisputePage({ id }: { id: string }) {
  const dispute = useAdminDispute(id);
  if (dispute.error instanceof ApiError && dispute.error.status === 404) notFound();
  if (dispute.isError) {
    return (
      <LoadError
        className="page"
        title="We could not load this dispute"
        error={dispute.error}
        onRetry={() => void dispute.refetch()}
      />
    );
  }
  if (!dispute.data) return <PageSkeleton />;
  const d = dispute.data;
  return (
    <div className="page max-w-[1180px]">
      <nav aria-label="Breadcrumb" className="mb-3">
        <Link href="/admin/disputes" className="t-small inline-flex min-h-8 items-center gap-1.5">
          <Icon name="arrowRight" size={16} className="rotate-180" />
          Disputes
        </Link>
      </nav>
      <div className="mb-6 flex flex-col gap-2.5">
        <h1 className="t-h1">{d.subject}</h1>
        <div className="flex flex-wrap items-center gap-3.5">
          <DisputeBadge dispute={d} />
          <span className="t-small c-ink-2">
            Raised by {at(d.raisedBy.username)}, {roleWord(d.raisedBy.role)}, on{' '}
            {formatFullDayTime(d.createdAt)}
          </span>
        </div>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="sec" aria-labelledby="what-h">
            <div className="sec-h">
              <h2 id="what-h" className="t-h3">
                What they wrote
              </h2>
            </div>
            <div className="sec-b px-4 py-4 md:px-6">
              <div className="quote">{d.description}</div>
            </div>
          </section>
          {d.status === 'OPEN' ? <ResolveForm dispute={d} /> : <Resolution dispute={d} />}
        </div>
        <aside className="flex flex-col gap-4" aria-label="The deal">
          <Side dispute={d} />
        </aside>
      </div>
    </div>
  );
}
