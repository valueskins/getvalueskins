'use client';

import { Icon } from '@/components/ui/Icon';
import { useSupportAddress } from '@/components/shell/SupportEmail';

// Company details as the live site publishes them.
const PHONE = '+91 88056 95324';
const GRIEVANCE_OFFICER = 'Saketh Velamuri';
const COMPANY_GSTIN = '27AAMCV5525E1Z5';

const WHAT_TO_INCLUDE = [
  {
    k: 'The deal id',
    v: 'The 8 characters on the deal page, like 8K2M4QXZ. Put it in the subject.',
  },
  {
    k: 'Your Instagram username',
    v: 'The account you sign in with, so we find you straight away.',
  },
  { k: 'What happened, and when', v: 'What you did, what you saw, and the date and time.' },
  { k: 'Screenshots', v: 'If you have them. A picture of the screen often says it all.' },
];

/** /contact: one address, what to put in the email, and the company's formal details. */
export function ContactPage() {
  const email = useSupportAddress();
  return (
    <div className="contact">
      <header className="contact-hero">
        <h1 className="t-display">Write to us</h1>
        <p className="contact-lede">
          About a deal, your account or the website. A person reads every email and replies within
          24 hours.
        </p>
      </header>

      <div className="contact-grid">
        <section className="contact-mail" aria-labelledby="mail-title">
          <p id="mail-title" className="t-label c-ink-2">
            Email
          </p>
          <a href={`mailto:${email}`} className="contact-address">
            {email}
          </a>
          <div>
            <a href={`mailto:${email}`} className="btn btn-primary">
              <Icon name="envelope" />
              Email us
            </a>
          </div>
          <div className="callout callout-info">
            <Icon name="info" />
            <p>
              A problem with a deal in progress? Raise a dispute from the deal page. Both sides then
              see the same record.
            </p>
          </div>
        </section>

        <section className="card card-pad flex flex-col gap-4" aria-labelledby="include-title">
          <h2 id="include-title" className="t-h3">
            What to put in your email
          </h2>
          <ol className="nsteps contact-list">
            {WHAT_TO_INCLUDE.map((item) => (
              <li key={item.k}>
                <span>
                  <strong className="c-ink">{item.k}.</strong> {item.v}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="contact-formal" aria-labelledby="company-title">
        <div>
          <h2 id="company-title" className="t-h3">
            Valueskins Private Limited
          </h2>
          <p className="t-small c-ink-2">
            GSTIN <span className="t-mono">{COMPANY_GSTIN}</span>
          </p>
        </div>
        <div>
          <h3 className="t-label c-ink-2">Formal complaints</h3>
          <p className="t-small">
            Grievance officer: {GRIEVANCE_OFFICER}, at {email}. Acknowledged within 24 hours,
            resolved within 15 days, as Indian law requires.
          </p>
        </div>
        <div>
          <h3 className="t-label c-ink-2">Phone and WhatsApp</h3>
          <p className="t-small">
            <a href={`tel:${PHONE.replace(/\s/g, '')}`}>{PHONE}</a>, Monday to Saturday, 10:00 am to
            7:00 pm IST.
          </p>
        </div>
      </section>
    </div>
  );
}
