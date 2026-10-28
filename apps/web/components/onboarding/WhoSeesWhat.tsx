import { useId } from 'react';
import type { UserRole } from '@valueskins/shared';
import { Icon } from '@/components/ui/Icon';

/**
 * Who sees what, in plain words, next to the fields (SPEC 6.4 and 11). The profile card is open to
 * signed-in brands and creators, including the verified email as the contact, because there is no
 * chat. Billing details and the full UPI ID are not on it.
 */
export function WhoSeesWhat({ role }: { role: UserRole }) {
  const isBrand = role === 'BRAND';
  const titleId = useId();
  return (
    <section className="who-sees" aria-labelledby={titleId}>
      <h2 id={titleId} className="t-label c-ink-2">
        Who sees what
      </h2>
      <div className="who-sees-row">
        <span className="who-sees-icon is-public" aria-hidden="true">
          <Icon name="user" size={16} />
        </span>
        <p className="t-small">
          <strong className="font-semibold">
            On your profile, for signed-in brands and creators:
          </strong>{' '}
          {isBrand ? 'your brand name, city, website and pitch' : 'your name, city, age and gender'}
          , your Instagram numbers, your completed deals and their amounts, and your verified email
          as the contact, because there is no chat.
        </p>
      </div>
      <div className="who-sees-row">
        <span className="who-sees-icon is-private" aria-hidden="true">
          <Icon name="lock" size={16} />
        </span>
        <p className="t-small">
          <strong className="font-semibold">Private:</strong>{' '}
          {isBrand
            ? 'your billing details. They go only on the GST tax invoice for the ValueSkins fee.'
            : 'your full UPI ID. Only the brand that confirms you on a deal sees it in full, after you agree, and only while a payment is due. Everyone else sees it masked.'}
        </p>
      </div>
    </section>
  );
}
