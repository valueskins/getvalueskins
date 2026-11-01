import { HomeSignIn } from './HomeSignIn';
import { nth } from './motion';

/** The close: one big line on the accent block, and sign-in. */
export function FinalCta() {
  return (
    <section className="hm-cta" aria-labelledby="cta-title">
      <div className="hm-wrap">
        <div className="hm-cta-block">
          <h2 id="cta-title" className="hm-cta-title">
            <span className="hm-cta-line">Your next deal</span>{' '}
            <span className="hm-cta-line">starts here.</span>
          </h2>
          <p className="hm-cta-lede" data-rise style={nth(1)}>
            A Business account joins as a brand. A Creator account joins as a creator.
          </p>
          <div data-rise style={nth(2)}>
            <HomeSignIn variant="ink" />
          </div>
        </div>
      </div>
    </section>
  );
}
