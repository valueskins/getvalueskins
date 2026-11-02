import { formatInr, STEP_LABELS } from '@valueskins/shared';
import { STORY_BREAKDOWN } from './screens/data';

const fee = formatInr(STORY_BREAKDOWN.commissionTotalPaise);

/** The seven steps of a deal, one line each. */
const STEPS = [
  { title: 'Post the deal', text: 'The brand sets the work, the deadline and a final amount.' },
  { title: 'Apply for free', text: 'Every creator sees every open deal and can apply.' },
  {
    title: 'Pick one creator',
    text: `The brand pays ValueSkins ${fee} through Razorpay, with a GST invoice.`,
  },
  {
    title: 'Pay 30% by UPI',
    text: 'Before work starts, paid directly to the creator, who confirms it.',
  },
  {
    title: 'Share the content',
    text: 'The creator shares a Google Drive link, and the brand approves it.',
  },
  {
    title: 'Pay 70% by UPI',
    text: 'After approval, paid directly to the creator, who confirms it.',
  },
  { title: 'Keep the record', text: 'The deal goes on both profiles, with a record to download.' },
];

/**
 * How it works: the seven steps in one screen, beside the example deal once it is completed, with
 * the fee paid and everything the creator was paid by UPI.
 */
export function HowItWorks() {
  return (
    <section id="how" className="hm-how" aria-labelledby="how-title">
      <div className="hm-wrap hm-how-grid">
        <div className="hm-how-aside">
          <h2 id="how-title" className="hm-h2" data-rise>
            From posted to paid.
          </h2>
          <div className="hm-how-now" aria-hidden="true">
            <p className="hm-how-count hm-num">
              Step {STEP_LABELS.length} of {STEP_LABELS.length}
            </p>
            <p className="hm-how-label">{STEP_LABELS[STEP_LABELS.length - 1]}</p>
            <ol className="hm-rail">
              {STEP_LABELS.map((l) => (
                <li key={l} />
              ))}
            </ol>
            <dl className="hm-how-money">
              <div>
                <dt>Fee to ValueSkins</dt>
                <dd className="hm-num">{fee}</dd>
              </div>
              <div>
                <dt>Paid to the creator by UPI</dt>
                <dd className="hm-num">{formatInr(STORY_BREAKDOWN.creatorAmountPaise)}</dd>
              </div>
            </dl>
          </div>
          {/* The panel is a picture; the nine steps are listed here for assistive technology. */}
          <ol className="sr-only" aria-label="The nine steps of a deal">
            {STEP_LABELS.map((l, i) => (
              <li key={l}>{`${l}${i === STEP_LABELS.length - 1 ? ', current step' : ', done'}`}</li>
            ))}
          </ol>
        </div>
        <ol className="hm-how-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="hm-how-n hm-num" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="hm-h3">{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
