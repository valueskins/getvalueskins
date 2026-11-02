import { formatInr, type MoneyBreakdown } from '@valueskins/shared';
import { DealCalculator } from './DealCalculator';
import { nth } from './motion';

/** What it costs: one fee per deal, everything else free, and the calculator as the instrument. */
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
    <section id="costs" className="hm-costs" aria-labelledby="costs-title">
      <div className="hm-wrap">
        <h2 id="costs-title" className="hm-h2 hm-costs-title" data-rise>
          <span className="hm-price hm-num">{formatInr(fee.commissionTotalPaise)}</span> a deal.
          Everything else is free.
        </h2>
        <div className="hm-costs-grid">
          <div className="hm-costs-copy">
            <p data-rise style={nth(1)}>
              The brand pays ValueSkins {formatInr(fee.commissionBasePaise)} + {gstRateBps / 100}%
              GST {formatInr(fee.commissionGstPaise)} per deal through Razorpay, out of the deal
              amount, and gets a GST invoice. The rest is the creator&apos;s.
            </p>
            <ul className="hm-free" data-rise style={nth(2)}>
              <li>Signing up is free</li>
              <li>Browsing deals is free</li>
              <li>Applying is free</li>
            </ul>
          </div>
          <div className="hm-costs-card" data-rise style={nth(1)}>
            <DealCalculator
              initialDigits={initialDigits}
              minPaise={minPaise}
              gstRateBps={gstRateBps}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
