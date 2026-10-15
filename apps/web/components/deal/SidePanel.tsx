'use client';

import { formatInr, type DealDetail } from '@valueskins/shared';
import { formatShortDateTime } from '@/lib/dealFormat';
import {
  actionOf,
  at,
  lastNotReceived,
  pendingRecord,
  reasonOf,
  type Viewer,
} from '@/lib/dealView';
import { countdown, longDate } from '@/lib/deadlines';
import { Badge, type BadgeKind } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { useNow } from './useNow';

type Mark = [string, BadgeKind] | null;

function stageMark(deal: DealDetail, viewer: Viewer, stage: 'ADVANCE' | 'FINAL'): Mark {
  const brand = viewer === 'brand';
  const doneAt = stage === 'ADVANCE' ? deal.advancePaidAt : deal.completedAt;
  if (doneAt) return [`${brand ? 'Confirmed' : 'Received'} ${formatShortDateTime(doneAt)}`, 'ok'];
  if (deal.status === 'CANCELLED') return ['Not paid', 'cancelled'];
  const dueStatus = stage === 'ADVANCE' ? 'COMMISSION_PAID' : 'APPROVED';
  if (deal.status === dueStatus) {
    if (pendingRecord(deal)) return [brand ? 'Waiting for creator' : 'Check your UPI app', 'wait'];
    if (lastNotReceived(deal)) return ['Not received', 'error'];
    return brand ? ['Due now', 'wait'] : ['Not paid yet', 'draft'];
  }
  return [stage === 'ADVANCE' ? 'Not due yet' : 'After approval', 'draft'];
}

function feeMark(deal: DealDetail, viewer: Viewer): Mark {
  if (deal.commissionPaidAt) {
    return [
      deal.status === 'CANCELLED'
        ? 'Paid, kept'
        : `Paid ${formatShortDateTime(deal.commissionPaidAt)}`,
      'ok',
    ];
  }
  if (deal.status === 'CANCELLED') return ['Not charged', 'cancelled'];
  if (deal.status === 'CONFIRMED')
    return [viewer === 'brand' ? 'Due now' : 'Brand pays now', 'wait'];
  return ['After confirming', 'draft'];
}

function Row({
  label,
  paise,
  sub,
  mark,
  strong,
}: {
  label: string;
  paise: number | null;
  sub: string;
  mark?: Mark;
  strong?: boolean;
}) {
  return (
    <div className="amt">
      <p className={strong ? 't-small font-semibold' : 't-small'}>{label}</p>
      {paise !== null ? (
        <Money
          paise={paise}
          size="s"
          className={strong ? 'text-right font-semibold' : 'text-right'}
        />
      ) : (
        <span />
      )}
      <p className="t-small c-ink-3">{sub}</p>
      <p className="text-right">{mark ? <Badge kind={mark[1]}>{mark[0]}</Badge> : null}</p>
    </div>
  );
}

function Amounts({ deal, viewer }: { deal: DealDetail; viewer: Viewer }) {
  const U = deal.creator ? at(deal.creator.username) : 'the creator';
  const BU = at(deal.brand.username);
  const isCreator = viewer !== 'brand';
  const masked = deal.directPayments[deal.directPayments.length - 1]?.maskedVpa;
  const fee = `${deal.commissionBasePaise !== null ? formatInr(deal.commissionBasePaise) : ''} + GST ${
    deal.commissionGstPaise !== null ? formatInr(deal.commissionGstPaise) : ''
  }, through Razorpay`;
  const live = viewer !== 'other';
  return (
    <section className="card" aria-labelledby="amt-h">
      <div className="panel-head">
        <h2 id="amt-h" className="t-h3">
          Amounts
        </h2>
        <span className="t-small c-ink-3">Fixed at publish</span>
      </div>
      <div className="hr" />
      {isCreator && deal.creatorAmountPaise !== null ? (
        <div className="px-5 pt-3.5">
          <p className="t-small c-ink-2">You receive</p>
          <Money paise={deal.creatorAmountPaise} size="l" />
        </div>
      ) : null}
      <div className="px-5 pb-2 pt-1">
        {viewer === 'brand' ? (
          <>
            <Row label="Budget" paise={deal.budgetPaise} sub="What you pay in total" strong />
            <Row
              label="ValueSkins fee"
              paise={deal.commissionTotalPaise}
              sub={fee}
              mark={feeMark(deal, viewer)}
            />
            <Row
              label={`30% to ${U}`}
              paise={deal.advancePaise}
              sub="By UPI, before work starts"
              mark={stageMark(deal, viewer, 'ADVANCE')}
            />
            <Row
              label={`70% to ${U}`}
              paise={deal.finalPaise}
              sub="By UPI, after you approve"
              mark={stageMark(deal, viewer, 'FINAL')}
            />
          </>
        ) : (
          <>
            <Row
              label="30% before work starts"
              paise={deal.advancePaise}
              sub={`From ${BU} by UPI`}
              mark={live ? stageMark(deal, viewer, 'ADVANCE') : null}
            />
            <Row
              label="70% after approval"
              paise={deal.finalPaise}
              sub={`From ${BU} by UPI`}
              mark={live ? stageMark(deal, viewer, 'FINAL') : null}
            />
            <Row
              label="ValueSkins fee"
              paise={deal.commissionTotalPaise}
              sub="Paid by the brand through Razorpay"
              mark={live ? feeMark(deal, viewer) : null}
            />
          </>
        )}
      </div>
      {viewer === 'creator' && masked ? (
        <p className="t-small c-ink-2 rounded-b border-t border-rule bg-page px-5 py-3">
          Paid straight to <span className="t-mono">{masked}</span> by UPI.
        </p>
      ) : null}
    </section>
  );
}

function deadlineMark(
  deal: DealDetail,
  which: 'apply' | 'due' | 'end',
  now: Date,
): [string, BadgeKind] {
  const s = deal.status;
  if (s === 'CANCELLED') return ['Not needed', 'cancelled'];
  if (which === 'apply') {
    if (s !== 'OPEN' || !deal.applicationDeadline) return ['Done', 'cancelled'];
  }
  if (
    which === 'due' &&
    deal.contentUploadedAt &&
    s !== 'ADVANCE_PAID' &&
    s !== 'REVISION_REQUESTED'
  ) {
    return [`Shared ${formatShortDateTime(deal.contentUploadedAt)}`, 'ok'];
  }
  if (which === 'end' && deal.completedAt)
    return [`Completed ${formatShortDateTime(deal.completedAt)}`, 'done'];
  const date =
    which === 'apply'
      ? deal.applicationDeadline
      : which === 'due'
        ? deal.contentUploadDeadline
        : deal.dealDeadline;
  if (!date) return ['Not set', 'draft'];
  const c = countdown(date, now);
  return [c.text, c.overdue ? 'error' : c.soon ? 'wait' : 'draft'];
}

function Deadlines({ deal }: { deal: DealDetail }) {
  const now = useNow();
  const rows: Array<[string, string | null, 'apply' | 'due' | 'end']> = [
    ['Apply by', deal.applicationDeadline, 'apply'],
    ['Content due', deal.contentUploadDeadline, 'due'],
    ['Deal ends', deal.dealDeadline, 'end'],
  ];
  return (
    <section className="card" aria-labelledby="dl-h">
      <div className="panel-head">
        <h2 id="dl-h" className="t-h3">
          Deadlines
        </h2>
        <span className="t-small c-ink-3">11:59 pm IST</span>
      </div>
      <div className="hr" />
      <div className="px-5 pb-2 pt-1">
        {rows.map(([label, date, which]) => {
          const [text, kind] = deadlineMark(deal, which, now);
          return (
            <div key={label} className="amt">
              <div>
                <p className="t-small">{label}</p>
                <p className="t-small c-ink-2">{date ? longDate(date) : 'Not set'}</p>
              </div>
              <Badge kind={kind}>{text}</Badge>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SidePanel({
  deal,
  viewer,
  onCancel,
  onDispute,
}: {
  deal: DealDetail;
  viewer: Viewer;
  onCancel: () => void;
  onDispute: () => void;
}) {
  const cancel = actionOf(deal, 'CANCEL');
  const dispute = actionOf(deal, 'RAISE_DISPUTE');
  return (
    <aside className="flex flex-col gap-4" aria-label="Amounts, deadlines and help">
      <Amounts deal={deal} viewer={viewer} />
      <Deadlines deal={deal} />
      {cancel ? (
        cancel.enabled ? (
          <section className="card card-pad flex flex-col gap-2.5">
            <Button variant="danger-outline" block onClick={onCancel}>
              Cancel deal
            </Button>
            <p className="t-small c-ink-2">
              Free until you pay the ValueSkins fee. After that, only ValueSkins can cancel it.
            </p>
          </section>
        ) : (
          <section className="card card-pad flex flex-col gap-2">
            <p className="t-small font-medium">Cancelling</p>
            <p className="t-small c-ink-2">{cancel.reason}</p>
          </section>
        )
      ) : null}
      {dispute ? (
        <section className="card card-pad flex flex-col gap-2.5">
          <p className="t-small font-medium">Something wrong?</p>
          <p className="t-small c-ink-2">
            Tell ValueSkins what happened. Both of you get a copy by email.
          </p>
          <Button variant="secondary" block disabledReason={reasonOf(dispute)} onClick={onDispute}>
            Raise a dispute
          </Button>
        </section>
      ) : null}
    </aside>
  );
}
