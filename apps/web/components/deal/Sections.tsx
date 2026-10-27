'use client';

import { Fragment, useState } from 'react';
import {
  formatInr,
  type DealDetail,
  type DealEmail,
  type DealEvent,
  type DocumentKind,
} from '@valueskins/shared';
import { parseBrief } from '@/lib/brief';
import { formatDayTime, formatFullDayTime } from '@/lib/dealFormat';
import { at, type Viewer } from '@/lib/dealView';
import { longDate } from '@/lib/deadlines';
import { errorText } from '@/lib/api/errors';
import { Badge } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cx } from '@/components/ui/cx';
import { DocumentLink } from './DocumentLink';
import { PaymentRecord } from './PaymentRecord';
import { Section } from './Section';

/** A history read that failed: what is missing, and Try again. */
export interface Failed {
  error: unknown;
  retry: () => void;
}

function SectionError({ what, failed }: { what: string; failed: Failed }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <p className="t-small text-danger" role="alert">
        We could not load the {what}. {errorText(failed.error)}
      </p>
      <Button variant="secondary" size="sm" onClick={failed.retry}>
        Try again
      </Button>
    </div>
  );
}

export function BriefSection({ deal, defaultOpen }: { deal: DealDetail; defaultOpen: boolean }) {
  const parts = parseBrief(deal.description ?? '');
  return (
    <Section title="The brief" fold="always" defaultOpen={defaultOpen}>
      <div className="px-6 pb-3 pt-1">
        <dl className="brief">
          {parts.map((p, i) => (
            <Fragment key={i}>
              <dt>{p.kind === 'item' ? p.label : i === 0 ? 'Brief' : 'Notes'}</dt>
              <dd className="whitespace-pre-line">{p.text}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </Section>
  );
}

export function LinksSection({ deal }: { deal: DealDetail }) {
  const links = deal.contentUploads;
  const empty =
    deal.status === 'CANCELLED'
      ? 'Nothing was shared before the deal was cancelled.'
      : deal.creator
        ? `No content shared yet.${deal.contentUploadDeadline ? ` Due ${longDate(deal.contentUploadDeadline)}, 11:59 pm IST.` : ''}`
        : 'The confirmed creator shares Google Drive links here.';
  return (
    <Section title="Content links" aside={links.length ? `${links.length} of up to 20` : undefined}>
      {links.length ? (
        [...links].map((l, i) => (
          <div key={`${l.link}-${i}`} className="rec">
            <p className="rec-k">Link {i + 1}</p>
            <div className="min-w-0">
              <a
                href={l.link}
                target="_blank"
                rel="noreferrer"
                className="t-mono t-small block truncate"
              >
                {l.link}
              </a>
              <p className="rec-sub">Shared {formatDayTime(l.uploadedAt)}</p>
            </div>
            {i === links.length - 1 ? <Badge kind="progress">Latest</Badge> : <span />}
          </div>
        ))
      ) : (
        <p className="sec-empty">{empty}</p>
      )}
    </Section>
  );
}

/** Every round of changes the brand asked for, oldest first (`feedbackHistory` on the deal). */
export function FeedbackSection({ deal }: { deal: DealDetail }) {
  const rounds = deal.feedbackHistory;
  return (
    <Section
      title="Feedback"
      aside={
        rounds.length ? `${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}` : undefined
      }
    >
      {rounds.length ? (
        rounds.map((r, i) => (
          <div
            key={`${r.at}-${i}`}
            className="flex flex-col gap-1.5 border-t border-border px-6 py-3.5 first:border-t-0"
          >
            <p className="t-small c-ink-2">
              Round {i + 1}, from {at(deal.brand.username)}, {formatDayTime(r.at)}
            </p>
            <div className="quote">{r.feedback}</div>
          </div>
        ))
      ) : (
        <p className="sec-empty">No changes requested.</p>
      )}
    </Section>
  );
}

export function PaymentsSection({ deal, viewer }: { deal: DealDetail; viewer: Viewer }) {
  const brandName = viewer === 'brand' ? 'you' : at(deal.brand.username);
  const fee = deal.commissionTotalPaise;
  let feeSub: string;
  let feeBadge: React.ReactNode;
  if (deal.commissionPaidAt) {
    const invoice = deal.documents.find((d) => d.kind === 'commission-invoice');
    feeSub = `Paid by ${brandName} through Razorpay on ${formatDayTime(deal.commissionPaidAt)}.${invoice?.number ? ` Tax invoice ${invoice.number}.` : ''}${deal.status === 'CANCELLED' ? ' Kept after the cancel.' : ''}`;
    feeBadge = <Badge kind="ok">Paid</Badge>;
  } else if (deal.status === 'CANCELLED') {
    feeSub = 'Not charged. The deal was cancelled before the fee.';
    feeBadge = <Badge kind="cancelled">Not charged</Badge>;
  } else if (deal.status === 'CONFIRMED') {
    feeSub = 'Due now, through Razorpay.';
    feeBadge = <Badge kind="wait">Due</Badge>;
  } else {
    feeSub = 'Due after a creator is confirmed.';
    feeBadge = <Badge kind="draft">Not due</Badge>;
  }
  return (
    <Section
      title="Payments"
      footer="UPI payments go straight from the brand to the creator. ValueSkins does not receive or hold this money."
    >
      <div className="rec">
        <p className="rec-k">ValueSkins fee</p>
        <div>
          {fee !== null ? <p className="money money-s">{formatInr(fee)}</p> : null}
          <p className="rec-sub">{feeSub}</p>
        </div>
        {feeBadge}
      </div>
      {deal.directPayments.map((r) => (
        <PaymentRecord key={r.id} record={r} viewer={viewer} />
      ))}
      {deal.directPayments.length === 0 ? (
        <p className="sec-empty border-t border-border">No UPI payments recorded yet.</p>
      ) : null}
    </Section>
  );
}

const DOCS: Array<{ kind: DocumentKind; name: string; later: string }> = [
  { kind: 'commission-invoice', name: 'Fee tax invoice', later: 'After the fee' },
  { kind: 'advance-payment-record', name: 'Advance payment record', later: 'After the advance' },
  { kind: 'final-payment-record', name: 'Final payment record', later: 'After the final' },
  { kind: 'adp', name: 'Deal record', later: 'At the end' },
];

export function DocumentsSection({ deal }: { deal: DealDetail }) {
  const cancelled = deal.status === 'CANCELLED';
  return (
    <Section title="Documents">
      {DOCS.map((d) => {
        const doc = deal.documents.find((x) => x.kind === d.kind);
        return (
          <div key={d.kind} className="doc-row">
            <div>
              <p className="t-small font-medium">{d.name}</p>
              <p className="rec-sub">
                {doc
                  ? d.kind === 'adp'
                    ? 'The full report of this deal, as one PDF'
                    : `${doc.number ?? ''}, issued ${formatFullDayTime(doc.issuedAt)}`
                  : cancelled
                    ? 'Not issued.'
                    : 'Issued at this step'}
              </p>
            </div>
            {doc ? (
              <DocumentLink dealId={deal.id} kind={d.kind} className="btn btn-secondary btn-sm">
                Download<span className="sr-only"> {d.name}</span>
              </DocumentLink>
            ) : (
              <Badge kind="draft">{cancelled ? 'None' : d.later}</Badge>
            )}
          </div>
        );
      })}
    </Section>
  );
}

function EmailRow({ email }: { email: DealEmail }) {
  const [open, setOpen] = useState(false);
  const to = email.recipient
    ? `${at(email.recipient.username)}, ${email.recipient.role === 'BRAND' ? 'brand' : email.recipient.role === 'CREATOR' ? 'creator' : 'ValueSkins'}`
    : 'ValueSkins';
  return (
    <div className="email-row">
      <button
        type="button"
        className="email-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="t-small min-w-0 font-medium">{email.subject}</span>
        <span className="t-small c-ink-2 whitespace-nowrap text-right">
          {formatDayTime(email.createdAt)}
        </span>
        <span className="rec-sub">
          To {to}
          {email.attachmentNames.map((a) => (
            <span key={a} className="att ml-2">
              {a}
            </span>
          ))}
          {email.status === 'FAILED' ? (
            <span className="ml-2 text-danger">Not delivered</span>
          ) : null}
        </span>
        <span />
      </button>
      {open ? <p className="email-body">{email.bodyText}</p> : null}
    </div>
  );
}

export function EmailsSection({
  emails,
  failed,
}: {
  emails: DealEmail[] | undefined;
  failed?: Failed;
}) {
  const [all, setAll] = useState(false);
  const list = emails ?? [];
  const shown = all ? list : list.slice(0, 5);
  return (
    <Section title="Emails sent" aside="To both of you, newest first">
      {failed ? (
        <SectionError what="emails" failed={failed} />
      ) : emails === undefined ? (
        <div className="px-6 py-4">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : shown.length ? (
        <>
          {shown.map((e) => (
            <EmailRow key={e.id} email={e} />
          ))}
          {list.length > 5 ? (
            <div className="sec-foot px-6 py-2">
              <button
                type="button"
                className="btn btn-text btn-sm -ml-3"
                onClick={() => setAll((v) => !v)}
              >
                {all ? 'Show fewer emails' : `Show all ${list.length} emails`}
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

function eventText(e: DealEvent, deal: DealDetail): string {
  if (e.kind === 'FEE_CAPTURED_DEAL_CHANGED') {
    return 'Fee received after the deal changed. ValueSkins will refund it.';
  }
  switch (e.toStatus) {
    case 'OPEN':
      return 'Published';
    case 'CONFIRMED':
      return deal.creator ? `Confirmed ${at(deal.creator.username)}` : 'Creator confirmed';
    case 'COMMISSION_PAID':
      return 'Fee paid through Razorpay';
    case 'ADVANCE_PAID':
      return 'Advance confirmed';
    case 'CONTENT_UPLOADED':
      return e.fromStatus === 'REVISION_REQUESTED' ? 'Content shared again' : 'Content shared';
    case 'REVISION_REQUESTED':
      return 'Changes requested';
    case 'APPROVED':
      return 'Approved';
    case 'COMPLETED':
      return 'Final payment confirmed. Deal completed.';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return 'Updated';
  }
}

function who(e: DealEvent): string {
  if (e.actor.type !== 'USER') return 'ValueSkins';
  return e.actor.username ? at(e.actor.username) : 'Deleted user';
}

export function ActivitySection({
  deal,
  events,
  failed,
}: {
  deal: DealDetail;
  events: DealEvent[] | undefined;
  failed?: Failed;
}) {
  // Status changes, and a fee kept on a deal that had changed. UPI records are under Payments.
  const list = (events ?? []).filter(
    (e) => e.kind === 'TRANSITION' || e.kind === 'FEE_CAPTURED_DEAL_CHANGED',
  );
  return (
    <Section
      title="Activity"
      aside="Oldest first"
      footer="Payments recorded by UPI are listed under Payments."
    >
      {failed ? (
        <SectionError what="activity" failed={failed} />
      ) : events === undefined ? (
        <div className="px-6 py-4">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ol className="timeline">
          {list.map((e) => (
            <li key={e.id} className={cx(e.toStatus === 'CANCELLED' && 'is-stop')}>
              <p className="t-small">
                <span className="font-medium">{eventText(e, deal)}</span>{' '}
                <span className="c-ink-2">by {who(e)}</span>
              </p>
              <p className="rec-sub">{formatFullDayTime(e.createdAt)}</p>
              {e.note ? <p className="tl-note">{e.note}</p> : null}
              {e.refundReference ? (
                <p className="rec-sub">Refund reference: {e.refundReference}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
