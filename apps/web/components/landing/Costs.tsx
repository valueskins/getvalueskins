import { formatInr, type MoneyBreakdown } from '@valueskins/shared';
import { Icon } from '@/components/ui/Icon';
import { DealCalculator } from './DealCalculator';
import { nth } from './motion';

/** What it costs: one fee per deal, everything else free, and the calculator. */
export function Costs({
  initialDigits,
  minPaise,
  gstRateBps,
  fee,
}: {
  initialDigits: string;
  minPaise: number;
  gstRateBps: number;
  fee: MoneyBreakdown;
}) {
  return (
    <section id="costs" className="v3-costs" aria-labelledby="costs-title">
      <div className="v3-costs-copy">
        <p className="v3-pill" data-rise>
          What it costs
        </p>
        <h2 id="costs-title" className="v3-h2" data-rise style={nth(1)}>
          <span className="v3-price">{formatInr(fee.commissionTotalPaise)}</span> per deal.{' '}
          <em>Everything</em> else is free.
        </h2>
        <p data-rise style={nth(2)}>
          The brand pays ValueSkins {formatInr(fee.commissionBasePaise)} + {gstRateBps / 100}% GST{' '}
          {formatInr(fee.commissionGstPaise)} per deal through Razorpay, out of the deal amount, and
          gets a GST tax invoice. The rest is the creator&apos;s.
        </p>
        <ul className="v3-free" data-rise style={nth(3)}>
          {['Signing up', 'Browsing deals', 'Applying'].map((t) => (
            <li key={t}>
              <Icon name="check" size={16} />
              {t} is free
            </li>
          ))}
        </ul>
      </div>
      <div className="v3-costs-card" data-rise style={nth(2)}>
        <DealCalculator initialDigits={initialDigits} minPaise={minPaise} gstRateBps={gstRateBps} />
      </div>
    </section>
  );
}
