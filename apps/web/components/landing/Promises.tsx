import { formatInr, type MoneyBreakdown } from '@valueskins/shared';
import { Icon } from '@/components/ui/Icon';
import { nth } from './motion';
import { RECORD_DEALS } from './screens/data';

/** The finished deals on the example creator's profile, as the app lists them. */
function Record() {
  return (
    <div
      className="hm-record"
      role="img"
      aria-label="Example: three finished deals on a creator's profile, with the brand and the amount."
    >
      <div inert>
        <div className="hm-mini-head">
          <p className="hm-strong">Finished deals</p>
          <span className="hm-example">Example</span>
        </div>
        <ul>
          {RECORD_DEALS.slice(0, 3).map((d) => (
            <li key={d.title}>
              <div>
                <p className="hm-strong">{d.title}</p>
                <p className="hm-small">
                  With @{d.withHandle}, {d.date}
                </p>
              </div>
              <p className="hm-num">{formatInr(d.amountPaise)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The rules that make a deal safe to take on, as a bento of five tiles: the money rule large and in
 * the accent, the record wide with its picture, three short facts between.
 */
export function Promises({ fee }: { fee: MoneyBreakdown }) {
  return (
    <section className="hm-promises" aria-labelledby="promises-title">
      <div className="hm-wrap">
        <h2 id="promises-title" className="hm-h2 hm-promises-title" data-rise>
          Clear rules for both sides.
        </h2>
        <ul className="hm-bento">
          <li className="hm-tile hm-tile-money" data-rise>
            <span className="hm-tile-glyph" aria-hidden="true">
              ₹
            </span>
            <h3 className="hm-h3">ValueSkins never holds the creator&apos;s money.</h3>
            <p>
              The brand pays the creator directly by UPI: 30% before work, 70% after approval. The
              creator confirms each payment.
            </p>
          </li>
          <li className="hm-tile hm-tile-insta" data-rise style={nth(1)}>
            <Icon name="instagram" size={24} />
            <h3 className="hm-h3">Numbers from Instagram</h3>
            <p>Followers and engagement come from Instagram. Nobody types them in.</p>
          </li>
          <li className="hm-tile hm-tile-invoice" data-rise style={nth(2)}>
            <p className="hm-tile-figure hm-num">{formatInr(fee.commissionTotalPaise)}</p>
            <h3 className="hm-h3">A GST invoice for the fee</h3>
            <p>Paid through Razorpay, out of the deal amount.</p>
          </li>
          <li className="hm-tile hm-tile-public" data-rise style={nth(1)}>
            <Icon name="user" size={24} />
            <h3 className="hm-h3">Public accounts only</h3>
            <p>A Business account joins as a brand. A Creator account joins as a creator.</p>
          </li>
          <li className="hm-tile hm-tile-record" data-rise style={nth(2)}>
            <div>
              <h3 className="hm-h3">On both profiles</h3>
              <p>
                Every finished deal goes on the brand&apos;s and the creator&apos;s profile, with a
                deal record to download.
              </p>
            </div>
            <Record />
          </li>
        </ul>
      </div>
    </section>
  );
}
