import { formatInr, MIN_BUDGET_PAISE, type MoneyBreakdown } from '@valueskins/shared';
import { nth } from './motion';

/** Questions, as an accordion of native details: each opens with a click, Enter or Space. */
export function Faq({ fee, minPaise }: { fee: MoneyBreakdown; minPaise: number }) {
  const items: Array<[string, string]> = [
    [
      'Who can join?',
      'Anyone with a public Instagram account. A Business account joins as a brand, a Creator account as a creator.',
    ],
    ['Where do followers and engagement come from?', 'From Instagram. Nobody types them in.'],
    [
      'What does it cost?',
      `Signing up, browsing deals and applying are free. The brand pays ValueSkins ${formatInr(fee.commissionTotalPaise)} per deal (${formatInr(fee.commissionBasePaise)} + GST ${formatInr(fee.commissionGstPaise)}) through Razorpay, out of the deal amount, and gets a GST tax invoice.`,
    ],
    [
      'Can the amount change after posting?',
      'No. The brand sets the amount and it is final. There is no chat and no negotiation.',
    ],
    [
      'How does the creator get paid?',
      'The brand pays the creator directly by UPI: 30% of what remains before work starts, 70% after approving the content. The creator confirms each payment. ValueSkins never holds the money.',
    ],
    [
      'How is the content shared?',
      'As a Google Drive link. The brand approves it or asks for changes.',
    ],
    [
      'What happens when a deal is done?',
      'Both download a deal record, and the deal is added to both profiles.',
    ],
    ['What is the smallest deal?', `${formatInr(Math.max(minPaise, MIN_BUDGET_PAISE))}.`],
  ];
  return (
    <section id="faq" className="hm-faq" aria-labelledby="faq-title">
      <div className="hm-wrap hm-faq-grid">
        <h2 id="faq-title" className="hm-h2 hm-faq-title" data-rise>
          Questions, answered.
        </h2>
        <div className="hm-faq-list">
          {items.map(([q, a], i) => (
            <details key={q} className="hm-faq-item" data-rise style={nth(Math.min(i, 4))}>
              <summary>
                <span>{q}</span>
                <span className="hm-faq-plus" aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
