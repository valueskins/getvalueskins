import type { DirectPaymentView } from '@valueskins/shared';
import { formatDayTime } from '@/lib/dealFormat';
import { Badge } from '@/components/ui/Callout';
import { cx } from '@/components/ui/cx';
import { Money } from '@/components/ui/Money';

export function stageLabel(stage: DirectPaymentView['stage']): string {
  return stage === 'FINAL' ? 'Final, 70%' : 'Advance, 30%';
}

/** One UPI payment record. A record marked not received is struck through, with the reason. */
export function PaymentRecord({
  record,
  viewer,
}: {
  record: DirectPaymentView;
  viewer: 'brand' | 'creator' | 'other';
}) {
  const struck = record.status === 'DISPUTED';
  const badge =
    record.status === 'CONFIRMED' ? (
      <Badge kind="ok">Confirmed</Badge>
    ) : struck ? (
      <Badge kind="error">Not received</Badge>
    ) : (
      <Badge kind="wait">
        {viewer === 'creator' ? 'Check your UPI app' : 'Waiting for creator'}
      </Badge>
    );
  const meta = [
    `Recorded ${formatDayTime(record.recordedAt)}.`,
    record.confirmedAt ? `Confirmed ${formatDayTime(record.confirmedAt)}.` : null,
    record.disputedAt ? `Marked not received ${formatDayTime(record.disputedAt)}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cx('rec', struck && 'is-struck')}>
      <p className="rec-k">{stageLabel(record.stage)}</p>
      <div className="min-w-0">
        <Money paise={record.amountPaise} size="s" />
        <p className="rec-sub">
          UPI reference <span className="rec-ref">{record.reference}</span>. To{' '}
          <span className="t-mono">{record.maskedVpa}</span>.
        </p>
        <p className="rec-sub">{meta}</p>
        {record.note ? <p className="rec-sub">Note from the brand: {record.note}</p> : null}
      </div>
      {badge}
      {struck && record.disputeReason ? <p className="rec-why">{record.disputeReason}</p> : null}
    </div>
  );
}
