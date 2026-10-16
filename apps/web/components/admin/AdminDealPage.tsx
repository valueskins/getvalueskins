'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useState } from 'react';
import { formatInr, type DealDetail } from '@valueskins/shared';
import { ApiError } from '@/lib/api/client';
import {
  useAdminDeal,
  useAdminResend,
  type AdminDealDetail,
  type AdminDispute,
  type AdminEmail,
  type AdminPayment,
} from '@/lib/api/admin';
import { errorText } from '@/lib/api/errors';
import { dealSteps } from '@/lib/dealStatus';
import { formatDayTime, formatFullDayTime } from '@/lib/dealFormat';
import { at } from '@/lib/dealView';
import { Badge } from '@/components/ui/Callout';
import { Button, LinkButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { LoadError } from '@/components/ui/LoadError';
import { Money } from '@/components/ui/Money';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ResumeCard } from '@/components/resume/ResumeCard';
import { DealSteps } from '@/components/deal/DealSteps';
import { PaymentRecord } from '@/components/deal/PaymentRecord';
import { Section } from '@/components/deal/Section';
import {
  ActivitySection,
  DocumentsSection,
  FeedbackSection,
  LinksSection,
} from '@/components/deal/Sections';
import { Amounts, Deadlines } from '@/components/deal/SidePanel';
import { StatusBadge } from '@/components/deal/StatusBadge';
import { AdminCancelModal, cancelBlockedReason } from './AdminCancelModal';

const EMAILS_SHOWN = 8;

export function roleWord(role: 'BRAND' | 'CREATOR'): string {
  return role === 'BRAND' ? 'the brand' : 'the creator';
}

export function DisputeBadge({ dispute }: { dispute: Pick<AdminDispute, 'status'> }) {
  return dispute.status === 'OPEN' ? (
    <Badge kind="wait">Open</Badge>
  ) : (
    <Badge kind="ok">Resolved</Badge>
  );
}

function Header({ deal, openDispute }: { deal: DealDetail; openDispute: boolean }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3">
        <Link href="/admin/deals" className="t-small inline-flex min-h-8 items-center gap-1.5">
          <Icon name="arrowRight" size={16} className="rotate-180" />
          Deals
        </Link>
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="m-0 text-[26px] font-semibold leading-[32px] tracking-[-0.015em] md:text-[34px] md:leading-[40px]">
            {deal.title ?? 'Untitled draft'}
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <StatusBadge status={deal.status} />
            <span className="t-mono t-small c-ink-3">{deal.shortId}</span>
            <span className="t-small c-ink-2">
              {deal.publishedAt
                ? `Posted ${formatFullDayTime(deal.publishedAt)}`
                : `Saved ${formatFullDayTime(deal.createdAt)}`}
            </span>
            {openDispute ? <Badge kind="error">Open dispute</Badge> : null}
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
              <p className="t-small c-ink-2 flex min-h-8 items-center">Not confirmed</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function DisputesSection({ disputes }: { disputes: AdminDispute[] }) {
  return (
    <Section
      title="Disputes"
      aside={disputes.length ? `${disputes.length} on this deal` : undefined}
    >
      {disputes.length ? (
        disputes.map((d) => (
          <div
            key={d.id}
            className="flex flex-col gap-2.5 border-t border-rule px-6 py-4 first:border-t-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="t-body font-semibold">{d.subject}</p>
              <DisputeBadge dispute={d} />
            </div>
            <p className="rec-sub">
              Raised by {at(d.raisedBy.username)}, {roleWord(d.raisedBy.role)}, on{' '}
              {formatFullDayTime(d.createdAt)}
            </p>
            <div className="quote text-[14px] leading-[21px]">{d.description}</div>
            {d.resolution ? (
              <p className="t-small">
                <span className="font-medium">Resolution:</span> {d.resolution}
              </p>
            ) : null}
            <div>
              <LinkButton href={`/admin/disputes/${d.id}`} variant="secondary" size="sm">
                Open dispute
              </LinkButton>
            </div>
          </div>
        ))
      ) : (
        <p className="sec-empty">No disputes on this deal.</p>
      )}
    </Section>
  );
}

function CopyId({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.show({ tone: 'ok', title: 'Copied', text: value });
    } catch {
      toast.show({ tone: 'error', title: 'Could not copy. Select the id and copy it by hand.' });
    }
  };
  return (
    <span className="id-copy">
      {value}
      <Button variant="ghost" size="sm" iconOnly aria-label={label} onClick={() => void copy()}>
        <Icon name="copy" size={16} />
      </Button>
    </span>
  );
}

const PAYMENT_BADGE: Record<AdminPayment['status'], ['ok' | 'wait' | 'error', string]> = {
  CAPTURED: ['ok', 'Captured'],
  CREATED: ['wait', 'Started'],
  FAILED: ['error', 'Failed'],
};

function FeeSection({ payments }: { payments: AdminPayment[] }) {
  return (
    <Section title="Fee payment" aside="Razorpay">
      {payments.length ? (
        payments.map((p) => {
          const [kind, text] = PAYMENT_BADGE[p.status];
          return (
            <div
              key={p.id}
              className="flex flex-col gap-3.5 border-t border-rule px-6 py-4 first:border-t-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <Money paise={p.amountPaise} size="m" />
                <Badge kind={kind}>{text}</Badge>
              </div>
              <dl className="kv">
                <dt>Razorpay order</dt>
                <dd>
                  {p.razorpayOrderId ? (
                    <CopyId value={p.razorpayOrderId} label="Copy the order id" />
                  ) : (
                    'None'
                  )}
                </dd>
                <dt>Razorpay payment</dt>
                <dd>
                  {p.razorpayPaymentId ? (
                    <CopyId value={p.razorpayPaymentId} label="Copy the payment id" />
                  ) : (
                    'None yet'
                  )}
                </dd>
                <dt>{p.capturedAt ? 'Captured' : 'Started'}</dt>
                <dd>{formatFullDayTime(p.capturedAt ?? p.createdAt)}</dd>
                {p.invoiceNumber ? (
                  <>
                    <dt>Tax invoice</dt>
                    <dd>
                      <span className="t-mono text-[13px]">{p.invoiceNumber}</span>
                    </dd>
                  </>
                ) : null}
                {p.razorpayFeePaise !== null ? (
                  <>
                    <dt>Razorpay fee</dt>
                    <dd>
                      <span className="money">{formatInr(p.razorpayFeePaise)}</span>
                      {p.razorpayTaxPaise !== null ? (
                        <>
                          {' '}
                          + GST <span className="money">{formatInr(p.razorpayTaxPaise)}</span>
                        </>
                      ) : null}
                      , absorbed by ValueSkins
                    </dd>
                  </>
                ) : null}
                {p.failureReason ? (
                  <>
                    <dt>Razorpay said</dt>
                    <dd>{p.failureReason}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          );
        })
      ) : (
        <p className="sec-empty">No fee payment started yet.</p>
      )}
      <p className="sec-foot">
        Refunds of the fee are done by hand in Razorpay. A failed attempt shows Razorpay&apos;s
        reason here.
      </p>
    </Section>
  );
}

function UpiSection({ detail }: { detail: AdminDealDetail }) {
  return (
    <Section
      title="UPI records"
      aside="Every record"
      footer="Paid directly by the brand to the creator by UPI. ValueSkins did not receive or hold this money."
    >
      {detail.directPayments.length ? (
        detail.directPayments.map((r) => <PaymentRecord key={r.id} record={r} viewer="other" />)
      ) : (
        <p className="sec-empty">No UPI payments recorded yet.</p>
      )}
    </Section>
  );
}

function EmailRow({ email }: { email: AdminEmail }) {
  const [open, setOpen] = useState(false);
  const resend = useAdminResend();
  const toast = useToast();
  const failed = email.status === 'FAILED';

  const send = async () => {
    try {
      const result = await resend.mutateAsync(email.id);
      const missing = result.missingAttachments.length
        ? ` Left off: ${result.missingAttachments.join(', ')}.`
        : '';
      toast.show({
        tone: result.status === 'FAILED' ? 'error' : 'ok',
        title: result.status === 'FAILED' ? 'The email did not send again' : 'Email sent again',
        text: `To ${email.toEmail}.${missing}`,
      });
    } catch (err) {
      toast.show({ tone: 'error', title: errorText(err) });
    }
  };

  return (
    <tr>
      <td data-label="Email">
        <button
          type="button"
          className="email-btn !grid-cols-1 !p-0 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="t-small font-medium">{email.subject}</span>
          <span className="rec-sub">Created {formatDayTime(email.createdAt)}</span>
        </button>
        {email.attachmentNames.map((a) => (
          <p key={a} className="att mt-1">
            {a}
          </p>
        ))}
        {failed && email.error ? (
          <p className="t-small mt-1 text-error">Error: {email.error}</p>
        ) : null}
        {open ? <p className="email-body !mx-0 mt-2">{email.bodyText}</p> : null}
      </td>
      <td data-label="To">
        <p className="t-mono text-[13px] [overflow-wrap:anywhere]">{email.toEmail}</p>
        {email.cc.length ? <p className="rec-sub">cc {email.cc.join(', ')}</p> : null}
      </td>
      <td data-label="Status">
        <Badge kind={failed ? 'error' : email.status === 'QUEUED' ? 'wait' : 'ok'}>
          {failed ? 'Failed' : email.status === 'QUEUED' ? 'Sending' : 'Sent'}
        </Badge>
        <p className="rec-sub mt-1">
          {email.sentAt ? formatDayTime(email.sentAt) : failed ? 'Not sent' : ''}
        </p>
      </td>
      <td className="md:text-right" data-label="Action">
        <Button
          variant="secondary"
          size="sm"
          loading={resend.isPending}
          onClick={() => void send()}
        >
          Resend<span className="sr-only"> {email.subject}</span>
        </Button>
      </td>
    </tr>
  );
}

function EmailsSection({ emails }: { emails: AdminEmail[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? emails : emails.slice(0, EMAILS_SHOWN);
  return (
    <Section title="Emails" aside="Newest first, with addresses">
      {emails.length ? (
        <>
          <div className="dt-wrap" tabIndex={0}>
            <table className="dt dt-stack">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col" className="w-[230px]">
                    To
                  </th>
                  <th scope="col" className="w-[130px]">
                    Status
                  </th>
                  <th scope="col" className="w-[110px]">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <EmailRow key={e.id} email={e} />
                ))}
              </tbody>
            </table>
          </div>
          {emails.length > EMAILS_SHOWN ? (
            <div className="sec-foot px-6 py-2">
              <button
                type="button"
                className="btn btn-text btn-sm -ml-3"
                onClick={() => setAll((v) => !v)}
              >
                {all ? `Show the latest ${EMAILS_SHOWN}` : `Show all ${emails.length}`}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="sec-empty">No emails yet.</p>
      )}
    </Section>
  );
}

function CancelCard({ deal, onCancel }: { deal: DealDetail; onCancel: () => void }) {
  const blocked = cancelBlockedReason(deal.status);
  return (
    <section className="card card-pad flex flex-col gap-2.5" aria-labelledby="cx-h">
      <h2 id="cx-h" className="t-h3">
        Cancel deal
      </h2>
      {blocked ? null : (
        <p className="t-small c-ink-2">
          For a deal between Fee paid and Approved, after talking to both sides. The ValueSkins fee
          is kept. Both sides get an email with your note.
        </p>
      )}
      <Button variant="danger-outline" block disabledReason={blocked} onClick={onCancel}>
        Cancel deal
      </Button>
    </section>
  );
}

function AdminDealView({ detail }: { detail: AdminDealDetail }) {
  const { deal } = detail;
  const [cancelOpen, setCancelOpen] = useState(false);
  const openDispute = detail.disputes.some((d) => d.status === 'OPEN');
  return (
    <div className="page">
      <Header deal={deal} openDispute={openDispute} />
      <section className="card card-pad mb-4" aria-label="Deal progress">
        <DealSteps steps={dealSteps(deal)} />
      </section>
      <div className="admin-note mb-6">
        <Icon name="info" />
        <p>
          <span className="font-medium text-ink">Admin view.</span> You are not part of this deal,
          so the brand&apos;s and the creator&apos;s buttons are not here. You can resend emails,
          resolve disputes and cancel the deal. UPI IDs stay masked for admins too.
        </p>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DisputesSection disputes={detail.disputes} />
          <FeeSection payments={detail.payments} />
          <UpiSection detail={detail} />
          <EmailsSection emails={detail.emails} />
          <LinksSection deal={deal} />
          <FeedbackSection deal={deal} events={detail.events} />
          <DocumentsSection deal={deal} />
          <ActivitySection deal={deal} events={detail.events} />
        </div>
        <aside className="flex flex-col gap-4" aria-label="Amounts, deadlines and cancel">
          <Amounts deal={deal} viewer="admin" />
          <Deadlines deal={deal} />
          <CancelCard deal={deal} onCancel={() => setCancelOpen(true)} />
        </aside>
      </div>
      <AdminCancelModal deal={deal} open={cancelOpen} onClose={() => setCancelOpen(false)} />
    </div>
  );
}

/** `/admin/deals/[id]` (AdDeal, AdDealCancel): everything about one deal, for an admin. */
export function AdminDealPage({ id }: { id: string }) {
  const detail = useAdminDeal(id);
  if (detail.error instanceof ApiError && detail.error.status === 404) notFound();
  if (detail.isError) {
    return (
      <LoadError
        className="page"
        title="We could not load this deal"
        error={detail.error}
        onRetry={() => void detail.refetch()}
      />
    );
  }
  if (!detail.data) return <PageSkeleton />;
  return <AdminDealView detail={detail.data} />;
}
