import type { Metadata } from 'next';
import { Icon } from '@/components/ui/Icon';
import { SupportEmail } from '@/components/shell/SupportEmail';

export const metadata: Metadata = { title: 'Contact' };

// Company details as the live site publishes them.
const PHONE = '+91 88056 95324';
const GRIEVANCE_OFFICER = 'Saketh Velamuri';
const COMPANY_GSTIN = '27AAMCV5525E1Z5';

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <p className="row-k">{k}</p>
      <div className="row-v">{children}</div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <div className="mx-auto grid max-w-page gap-8 px-4 pb-[88px] pt-10 md:px-8 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      <section aria-labelledby="contact-title" className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 id="contact-title" className="text-h1 md:text-display">
            Contact
          </h1>
          <p className="t-body c-ink-2">
            Write to us about a deal, your account or the website. A person reads every email.
          </p>
        </div>
        <div className="card flex flex-col gap-3 p-5 md:p-6">
          <p className="t-small c-ink-2">Email</p>
          <SupportEmail className="t-h3 break-all" />
          <p className="t-body c-ink-2">
            Put the deal id in the subject, like 8K2M4QXZ, so we can find it straight away.
          </p>
          <div>
            <SupportEmail className="btn btn-primary">
              <Icon name="envelope" />
              Email us
            </SupportEmail>
          </div>
        </div>
        <div className="card flex flex-col gap-2 p-5 md:p-6">
          <p className="t-small c-ink-2">Phone and WhatsApp</p>
          <a href={`tel:${PHONE.replace(/\s/g, '')}`} className="t-body">
            {PHONE}
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
      <section aria-label="Details" className="flex flex-col gap-6">
        <div className="card p-5 md:p-6">
          <h2 className="t-h3">When we reply</h2>
          <div className="mt-2">
            <Row k="First reply">Within 24 hours</Row>
            <Row k="Most issues">Resolved in 2 to 3 working days</Row>
            <Row k="Hours">
              Monday to Saturday, 10:00 am to 7:00 pm IST. We read email outside these hours too.
            </Row>
          </div>
        </div>
        <div className="card p-5 md:p-6">
          <h2 className="t-h3">Grievance officer</h2>
          <div className="mt-2">
            <Row k="Name">{GRIEVANCE_OFFICER}</Row>
            <Row k="Email">
              <SupportEmail />
            </Row>
            <Row k="Timeline">
              Acknowledged within 24 hours, resolved within 15 days, as Indian law requires.
            </Row>
          </div>
        </div>
        <div className="card p-5 md:p-6">
          <h2 className="t-h3">Company</h2>
          <div className="mt-2">
            <Row k="Registered name">Valueskins Private Limited</Row>
            <Row k="GSTIN">
              <span className="t-mono">{COMPANY_GSTIN}</span>
            </Row>
          </div>
        </div>
      </section>
    </div>
  );
}
