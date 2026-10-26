'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  computeBreakdown,
  GST_RATE_BPS,
  MIN_BUDGET_PAISE,
  rupeesToPaise,
} from '@valueskins/shared';
import { decideAccess } from '@/lib/access';
import { useConfig, useMe } from '@/lib/api/queries';
import { EXAMPLE_RUPEES } from './amount';
import { Costs } from './Costs';
import { DealBand } from './DealBand';
import { Faq } from './Faq';
import { FinalCta } from './FinalCta';
import { Footer } from './Footer';
import { Hero } from './Hero';
import { HowItWorks } from './HowItWorks';
import { useRiseIn } from './motion';
import { Nav } from './Nav';
import { Sides } from './Sides';
import { Why } from './Why';

/** Sends a signed-in visitor on to where they start. The page shows straight away for everyone else. */
function SignedInRedirect() {
  const router = useRouter();
  const me = useMe();
  useEffect(() => {
    if (!me.isSuccess) return;
    const decision = decideAccess(me.data, 'home');
    if (decision.kind === 'redirect') router.replace(decision.to);
  }, [me.isSuccess, me.data, router]);
  return null;
}

/** The home page: the product, playing its own story, for brands and creators alike. */
export function Landing({ initialDigits }: { initialDigits: string }) {
  const config = useConfig();
  const gstRateBps = config.data?.gstRateBps ?? GST_RATE_BPS;
  const minPaise = config.data?.minBudgetPaise ?? MIN_BUDGET_PAISE;
  // The fee is the same on every deal; the worked example shows it.
  const fee = computeBreakdown(rupeesToPaise(Number(EXAMPLE_RUPEES)), gstRateBps);
  const root = useRef<HTMLDivElement>(null);
  useRiseIn(root);
  // Script is running: the calculator's no-script submit button can go.
  useEffect(() => {
    root.current?.classList.add('has-js');
  }, []);

  return (
    <div ref={root} className="v3-root">
      <SignedInRedirect />
      <Nav />
      <main>
        <Hero emailSignIn={config.data?.authEmailEnabled === true} />
        <DealBand />
        <Sides />
        <HowItWorks />
        <Why />
        <Costs
          initialDigits={initialDigits}
          minPaise={minPaise}
          gstRateBps={gstRateBps}
          fee={fee}
        />
        <Faq fee={fee} minPaise={minPaise} />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
