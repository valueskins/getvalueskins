import { nth } from './motion';
import { SignIn } from './SignIn';

/** The close, on the dark ground: one line and sign-in. */
export function FinalCta() {
  return (
    <section className="v3-cta" aria-labelledby="cta-title">
      <div className="v3-glow" aria-hidden="true" />
      <h2 id="cta-title" className="v3-h2" data-rise>
        Your next deal <em>starts</em> here
      </h2>
      <p className="v3-lede" data-rise style={nth(1)}>
        A Business account joins as a brand. A Creator account joins as a creator.
      </p>
      <div data-rise style={nth(2)}>
        <SignIn onDark />
      </div>
    </section>
  );
}
