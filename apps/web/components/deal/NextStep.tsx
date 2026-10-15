'use client';

import { formatInr, type DealDetail } from '@valueskins/shared';
import {
  actionOf,
  at,
  lastNotReceived,
  pendingRecord,
  reasonOf,
  type Viewer,
} from '@/lib/dealView';
import { longDate } from '@/lib/deadlines';
import { formatFullDayTime } from '@/lib/dealFormat';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeKind } from '@/components/ui/Callout';
import { cx } from '@/components/ui/cx';
import { DeadlineBadge } from './DeadlineBadge';
import { DocumentLink } from './DocumentLink';
import { PaymentRecord } from './PaymentRecord';
import { ApplicantsPanel } from './panels/ApplicantsPanel';
import { ApplyPanel } from './panels/ApplyPanel';
import { ConfirmReceivedPanel } from './panels/ConfirmReceivedPanel';
import { FeePanel } from './panels/FeePanel';
import { LatestLink, ReviewPanel } from './panels/ReviewPanel';
import { ShareContentPanel } from './panels/ShareContentPanel';
import { UpiPayPanel } from './panels/UpiPayPanel';

type PanelKey =
  | 'apply'
  | 'applicants'
  | 'payFee'
  | 'upi'
  | 'waitConfirm'
  | 'waitShare'
  | 'review'
  | 'waitPick'
  | 'waitFee'
  | 'waitPay'
  | 'confirmPay'
  | 'share'
  | 'waitReview'
  | 'completed'
  | 'cancelled'
  | 'none';

/** Which Next step panel this person sees (the DlMap board). */
export function panelFor(deal: DealDetail, viewer: Viewer): PanelKey {
  const s = deal.status;
  if (s === 'CANCELLED') return 'cancelled';
  if (s === 'COMPLETED') return 'completed';
  if (viewer === 'other') return s === 'OPEN' ? 'apply' : 'none';
  const pending = pendingRecord(deal) !== null;
  if (viewer === 'brand') {
    switch (s) {
      case 'OPEN':
        return 'applicants';
      case 'CONFIRMED':
        return 'payFee';
      case 'COMMISSION_PAID':
      case 'APPROVED':
        return pending ? 'waitConfirm' : 'upi';
      case 'ADVANCE_PAID':
      case 'REVISION_REQUESTED':
        return 'waitShare';
      case 'CONTENT_UPLOADED':
        return 'review';
      default:
        return 'none';
    }
  }
  switch (s) {
    case 'CONFIRMED':
      return 'waitFee';
    case 'COMMISSION_PAID':
    case 'APPROVED':
      return pending ? 'confirmPay' : 'waitPay';
    case 'ADVANCE_PAID':
    case 'REVISION_REQUESTED':
      return 'share';
    case 'CONTENT_UPLOADED':
      return 'waitReview';
    default:
      return 'none';
  }
}

const YOUR_TURN: PanelKey[] = [
  'applicants',
  'payFee',
  'upi',
  'confirmPay',
  'share',
  'review',
  'apply',
];

function texts(deal: DealDetail, key: PanelKey): [string, string] {
  const U = deal.creator ? at(deal.creator.username) : 'the creator';
  const BU = at(deal.brand.username);
  const fin = deal.status === 'APPROVED';
  const amt = formatInr((fin ? deal.finalPaise : deal.advancePaise) ?? 0);
  const advance = formatInr(deal.advancePaise ?? 0);
  const notReceived = lastNotReceived(deal) !== null;
  const changes = deal.status === 'REVISION_REQUESTED';
  const late = deal.contentOverdue;
  const due = deal.contentUploadDeadline ? longDate(deal.contentUploadDeadline) : 'the due date';
  switch (key) {
    case 'apply':
      return [
        'Apply to this deal',
        'The amount is fixed by the brand. Read the brief, then apply if it suits you.',
      ];
    case 'applicants': {
      const n = deal.applicationCount ?? 0;
      const close = deal.applicationDeadline
        ? `Applications close ${longDate(deal.applicationDeadline)}, 11:59 pm IST, and you can still confirm someone after that.`
        : 'You can confirm someone after applications close too.';
      return [
        'Confirm one creator',
        `${n === 0 ? 'No one has applied yet.' : `${n} ${n === 1 ? 'has' : 'have'} applied.`} ${close}`,
      ];
    }
    case 'payFee':
      return [
        'Pay the ValueSkins fee to start the deal',
        `${U} is confirmed. After the fee, you pay them ${advance} by UPI before work starts.`,
      ];
    case 'upi':
      return notReceived
        ? [
            'Check the payment, then record it again',
            `Pay ${U} ${amt} by UPI from your own app. Then record the UPI reference below.`,
          ]
        : [
            `Pay ${U} ${amt} by UPI`,
            `${fin ? 'The final 70%, now that you approved the content.' : 'The 30% advance, before work starts.'} Pay from your own UPI app, then record the UPI reference below.`,
          ];
    case 'waitConfirm':
      return [
        'Waiting for the creator to confirm.',
        `We emailed ${U} to check their UPI app. If they do not confirm within 12 hours, we remind them.`,
      ];
    case 'waitShare':
      return changes
        ? [
            `Waiting for ${U} to share a new version`,
            'You asked for changes. We email you when the new link is shared.',
          ]
        : [
            `Waiting for ${U} to share the content`,
            late
              ? 'It is late. We remind both of you each day at 11:59 pm until it is shared.'
              : 'We email you as soon as they share a link.',
          ];
    case 'review':
      return [
        'Review the content',
        `${U} shared a Google Drive link. Approve it, or say what should change.`,
      ];
    case 'waitPick':
      return [`Waiting for ${BU} to pick a creator`, 'We email you when they decide.'];
    case 'waitFee':
      return [
        `Waiting for ${BU} to pay the ValueSkins fee`,
        `Then they pay your ${advance} advance by UPI. You share content once you confirm it arrived.`,
      ];
    case 'waitPay':
      return notReceived
        ? [
            `Waiting for ${BU} to record the payment again`,
            `You told them the ${amt} did not arrive. They check, pay if needed, and record it again. We email you.`,
          ]
        : [
            `Waiting for ${BU} to pay your ${fin ? `final ${amt}` : `advance of ${amt}`}`,
            'They pay you by UPI and record it here. We email you to check your UPI app.',
          ];
    case 'confirmPay':
      return [
        'Check your UPI app',
        fin ? 'The final 70% for the approved content.' : 'The 30% advance, before you start work.',
      ];
    case 'share':
      return changes
        ? [
            'Share a new link',
            `${BU} asked for changes. Share the new version as a new link. The earlier links stay on record.`,
          ]
        : [
            'Share your content',
            late
              ? `It was due ${due}, but you can still share it now. ${BU} has been told it is late.`
              : `Upload your content to Google Drive and share the link here. ${BU} reviews it.`,
          ];
    case 'waitReview':
      return [
        `Waiting for ${BU} to review your content`,
        'They approve it or ask for changes. We email you either way.',
      ];
    case 'completed':
      return ['This deal is complete', 'Both UPI payments are confirmed. Every document is ready.'];
    case 'cancelled':
      return deal.cancelledByRole === 'ADMIN'
        ? [
            'Cancelled by ValueSkins',
            deal.commissionPaidAt
              ? 'Cancelled after a dispute. The fee had already been paid.'
              : 'Cancelled by ValueSkins.',
          ]
        : [
            `Cancelled by ${BU}`,
            deal.commissionPaidAt
              ? 'The fee had already been paid.'
              : 'Cancelled before the fee was paid.',
          ];
    default:
      return ['', ''];
  }
}

function CompletedBody({ deal, viewer }: { deal: DealDetail; viewer: Viewer }) {
  const U = deal.creator ? at(deal.creator.username) : 'the creator';
  const brand = viewer === 'brand';
  const adv = deal.directPayments.find((r) => r.stage === 'ADVANCE' && r.status === 'CONFIRMED');
  const fin = deal.directPayments.find((r) => r.stage === 'FINAL' && r.status === 'CONFIRMED');
  return (
    <>
      <div className="breakdown max-w-[600px]">
        {brand && deal.commissionTotalPaise !== null ? (
          <div className="bd-row">
            <p className="t-small">ValueSkins fee, through Razorpay</p>
            <p className="money money-s">{formatInr(deal.commissionTotalPaise)}</p>
          </div>
        ) : null}
        {deal.advancePaise !== null ? (
          <div className="bd-row">
            <p className="t-small">Advance, 30%, by UPI</p>
            <p className="money money-s">{formatInr(deal.advancePaise)}</p>
            {adv?.confirmedAt ? (
              <p className="t-small c-ink-2">
                Confirmed by {U} on {formatFullDayTime(adv.confirmedAt)}
              </p>
            ) : null}
          </div>
        ) : null}
        {deal.finalPaise !== null ? (
          <div className="bd-row">
            <p className="t-small">Final, 70%, by UPI</p>
            <p className="money money-s">{formatInr(deal.finalPaise)}</p>
            {fin?.confirmedAt ? (
              <p className="t-small c-ink-2">
                Confirmed by {U} on {formatFullDayTime(fin.confirmedAt)}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="bd-row bd-total">
          <p className="t-body font-semibold">{brand ? 'Total paid' : 'You received'}</p>
          <p className="money money-m font-semibold">
            {formatInr((brand ? deal.budgetPaise : deal.creatorAmountPaise) ?? 0)}
          </p>
        </div>
      </div>
      {deal.documents.some((d) => d.kind === 'adp') ? (
        <div className="flex flex-wrap items-center gap-3">
          <DocumentLink dealId={deal.id} kind="adp" className="btn btn-primary">
            Download deal record
          </DocumentLink>
          <p className="t-small c-ink-2">
            One PDF with the brief, every payment, every link and feedback, and the full history.
          </p>
        </div>
      ) : null}
    </>
  );
}

function CancelledBody({ deal }: { deal: DealDetail }) {
  return (
    <>
      <div className="breakdown max-w-[640px]">
        <div className="bd-row">
          <p className="t-small">Cancelled by</p>
          <p className="t-small font-medium">
            {deal.cancelledByRole === 'ADMIN' ? 'ValueSkins' : at(deal.brand.username)}
          </p>
        </div>
        {deal.cancelledAt ? (
          <div className="bd-row">
            <p className="t-small">When</p>
            <p className="t-small font-medium">{formatFullDayTime(deal.cancelledAt)}</p>
          </div>
        ) : null}
        <div className="bd-row">
          <p className="t-small">ValueSkins fee</p>
          <p className="t-small font-medium">
            {deal.commissionPaidAt && deal.commissionTotalPaise !== null
              ? `The ValueSkins fee of ${formatInr(deal.commissionTotalPaise)} was kept.`
              : 'No fee was charged.'}
          </p>
        </div>
      </div>
      {deal.cancellationReason ? (
        <div className="flex flex-col gap-1.5">
          <p className="t-small c-ink-2">Reason</p>
          <div className="quote">{deal.cancellationReason}</div>
        </div>
      ) : null}
    </>
  );
}

/** The one thing this person can do now, or what they are waiting for. */
export function NextStep({
  deal,
  viewer,
  onDispute,
}: {
  deal: DealDetail;
  viewer: Viewer;
  onDispute: () => void;
}) {
  const key = panelFor(deal, viewer);
  if (key === 'none') return null;
  const [title, text] = texts(deal, key);
  const turn = YOUR_TURN.includes(key);
  const badge: [string, BadgeKind] = turn
    ? ['Your turn', 'wait']
    : key === 'completed'
      ? ['Done', 'done']
      : key === 'cancelled'
        ? ['Cancelled', 'cancelled']
        : ['Waiting', 'draft'];

  let body: React.ReactNode = null;
  let selfWrapped = false;
  switch (key) {
    case 'apply':
      body = <ApplyPanel deal={deal} />;
      break;
    case 'applicants':
      body = <ApplicantsPanel deal={deal} />;
      break;
    case 'payFee':
      body = <FeePanel deal={deal} />;
      break;
    case 'upi':
      body = <UpiPayPanel deal={deal} />;
      selfWrapped = true;
      break;
    case 'waitConfirm':
      body = (
        <div className="card overflow-hidden">
          <PaymentRecordRow deal={deal} />
        </div>
      );
      break;
    case 'waitPay':
    case 'confirmPay':
      body = <ConfirmReceivedPanel deal={deal} />;
      break;
    case 'share':
      body = <ShareContentPanel deal={deal} onDispute={onDispute} />;
      break;
    case 'waitShare':
      body = (
        <>
          {deal.contentUploadDeadline ? (
            <p className="t-small flex flex-wrap items-center gap-2">
              Content due {longDate(deal.contentUploadDeadline)}, 11:59 pm IST{' '}
              <DeadlineBadge date={deal.contentUploadDeadline} />
            </p>
          ) : null}
          {deal.status === 'REVISION_REQUESTED' && deal.feedback ? (
            <div className="flex flex-col gap-1.5">
              <p className="t-small c-ink-2">What you asked for</p>
              <div className="quote">{deal.feedback}</div>
            </div>
          ) : null}
        </>
      );
      break;
    case 'review':
      body = <ReviewPanel deal={deal} />;
      break;
    case 'waitReview':
      body = <LatestLink deal={deal} mine />;
      break;
    case 'completed':
      body = <CompletedBody deal={deal} viewer={viewer} />;
      break;
    case 'cancelled':
      body = <CancelledBody deal={deal} />;
      break;
    default:
      body = null;
  }

  return (
    <section className={cx('np', !turn && 'is-wait')} aria-labelledby="np-title">
      <div className="np-head">
        <p className="np-kicker">
          <Badge kind={badge[1]}>{badge[0]}</Badge>
        </p>
        <h2 id="np-title" className="t-h2">
          {title}
        </h2>
        <p className="t-body c-ink-2 max-w-[72ch]">{text}</p>
      </div>
      {selfWrapped ? body : body ? <div className="np-body">{body}</div> : <div className="pb-6" />}
    </section>
  );
}

/** The brand's view while its recorded payment waits for the creator. */
function PaymentRecordRow({ deal }: { deal: DealDetail }) {
  const record = pendingRecord(deal)!;
  const action = actionOf(deal, deal.status === 'APPROVED' ? 'PAY_FINAL' : 'PAY_ADVANCE');
  return (
    <>
      <PaymentRecord record={record} viewer="brand" />
      {action ? (
        <div className="border-t border-rule px-6 py-4">
          <Button variant="secondary" disabledReason={reasonOf(action)}>
            Record another payment
          </Button>
        </div>
      ) : null}
    </>
  );
}
