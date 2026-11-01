'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  computeBreakdown,
  GST_RATE_BPS,
  MIN_BUDGET_PAISE,
  rupeesToPaise,
} from '@valueskins/shared';
import { SiteFooter } from '@/components/shell/SiteChrome';
import { decideAccess } from '@/lib/access';
import { useConfig, useMe } from '@/lib/api/queries';
import { EXAMPLE_RUPEES } from './amount';
import { Costs } from './Costs';
import { Faq } from './Faq';
import { FinalCta } from './FinalCta';
import { Hero } from './Hero';
import { HomeNav } from './HomeNav';
import { HowItWorks } from './HowItWorks';
import { useRiseIn } from './motion';
import { Promises } from './Promises';
import { RulesStrip } from './RulesStrip';
import { Sides } from './Sides';

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

/** The home page: one deal, followed from posted to paid, for brands and creators alike. */
export function Landing({ initialDigits }: { initialDigits: string }) {
  const config = useConfig();
  const gstRateBps = config.data?.gstRateBps ?? GST_RATE_BPS;
  const minPaise = config.data?.minBudgetPaise ?? MIN_BUDGET_PAISE;
  // The fee is the same on every deal; the worked example shows it.
  const fee = computeBreakdown(rupeesToPaise(Number(EXAMPLE_RUPEES)), gstRateBps);
  const root = useRef<HTMLDivElement>(null);
  useRiseIn(root);
  // Script is running: the calculator's no-script submit button can go, and the entrances play.
  useEffect(() => {
    root.current?.classList.add('has-js');
  }, []);

  return (
    <div ref={root} className="hm">
      <SignedInRedirect />
      <HomeNav />
      <main>
        <Hero emailSignIn={config.data?.authEmailEnabled === true} />
        <RulesStrip />
        <Sides />
        <HowItWorks />
        <Costs
          initialDigits={initialDigits}
          minPaise={minPaise}
          gstRateBps={gstRateBps}
          fee={fee}
        />
        <Promises fee={fee} />
        <Faq fee={fee} minPaise={minPaise} />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
