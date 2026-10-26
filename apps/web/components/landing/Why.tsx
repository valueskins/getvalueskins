import { Icon } from '@/components/ui/Icon';
import { nth } from './motion';
import { Panel, ProfileRecord } from './screens/Screens';

const REASONS = [
  {
    icon: 'lock' as const,
    title: 'The amount is set up front',
    text: 'The brand sets it when posting. No back and forth, no chat, no negotiation.',
  },
  {
    icon: 'check' as const,
    title: 'Paid straight by UPI',
    text: 'Brands pay creators directly. ValueSkins never holds the money.',
  },
  {
    icon: 'instagram' as const,
    title: 'Numbers from Instagram',
    text: 'Followers and engagement come from Instagram. Nobody types them in.',
  },
  {
    icon: 'checkCircle' as const,
    title: 'On both profiles',
    text: 'Every finished deal is added to the brand and the creator, with the amount.',
  },
];

/** Why ValueSkins: four reasons, on the page's one dark section, beside a profile and its record. */
export function Why() {
  return (
    <section className="v3-why" aria-labelledby="why-title">
      <div className="v3-why-in">
        <div className="v3-why-copy">
          <p className="v3-pill v3-pill-dark" data-rise>
            Why ValueSkins
          </p>
          <h2 id="why-title" className="v3-h2" data-rise style={nth(1)}>
            Deals that <em>count</em>, on the record
          </h2>
          <ul className="v3-reasons">
            {REASONS.map((r, i) => (
              <li key={r.title} className="v3-reason-card" data-rise style={nth(i + 2)}>
                <span className="v3-reason-icon" aria-hidden="true">
                  <Icon name={r.icon} size={20} />
                </span>
                <h3 className="v3-h3">{r.title}</h3>
                <p>{r.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="v3-why-show" data-rise style={nth(2)}>
          <div className="v3-glow" aria-hidden="true" />
          <Panel
            title="Profile"
            label="Example: a creator's profile with followers, engagement and four finished deals."
          >
            <ProfileRecord />
          </Panel>
        </div>
      </div>
    </section>
  );
}
