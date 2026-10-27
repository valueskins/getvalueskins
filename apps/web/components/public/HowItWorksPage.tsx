'use client';

import { useRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ContentSection } from '@/lib/content';
import { nth, useRiseIn } from '@/components/landing/motion';
import { SignIn } from '@/components/landing/SignIn';
import {
  BrandApplicants,
  CreatorApplications,
  CreatorFeed,
  DealProgress,
  FeeInvoice,
  Panel,
  Phone,
  PostedDeal,
  ProfileRecord,
  ReceivedCard,
  SignInScreen,
} from '@/components/landing/screens/Screens';
import { SiteFooter, SiteHeader } from '@/components/shell/SiteChrome';

interface Doc {
  title: string;
  lede: string | null;
  sections: ContentSection[];
}

/** Links inside the text: the page's own links stay in the tab, others open a new one. */
const md = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) =>
    href?.startsWith('/') || href?.startsWith('#') ? (
      <a href={href}>{children}</a>
    ) : (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
};

function Markdown({ children }: { children: string }) {
  return (
    <div className="hiw-md">
      <ReactMarkdown components={md}>{children}</ReactMarkdown>
    </div>
  );
}

/**
 * The picture beside each step: the product drawn in HTML with made-up data (the home page's
 * screens), in the order the steps are written in content/how-it-works.md.
 */
const STEP_SCREENS: ReactNode[] = [
  <Phone key="signin" label="Example: the Instagram account read back at sign-in.">
    <SignInScreen />
  </Phone>,
  <Panel key="post" title="Your deal" label="Example: a posted deal with its amounts.">
    <PostedDeal />
  </Panel>,
  <Phone key="apply" label="Example: a creator applies to an open deal.">
    <CreatorFeed showNew={false} applyState="applied" />
  </Phone>,
  <Panel key="pick" title="Applicants" label="Example: a brand picks one creator.">
    <BrandApplicants showNew picked />
  </Panel>,
  <Panel key="fee" title="Payment 1" label="Example: the ValueSkins fee, paid.">
    <FeeInvoice />
  </Panel>,
  <Phone key="advance" label="Example: the creator confirms the 30% arrived.">
    <CreatorApplications picked />
    <ReceivedCard shown />
  </Phone>,
  <Panel key="deliver" title="The deal" label="Example: the content is shared on the deal.">
    <DealProgress reached={5} />
  </Panel>,
  <Panel key="review" title="The deal" label="Example: the brand approves the content.">
    <DealProgress reached={7} />
  </Panel>,
  <Phone key="final" label="Example: the creator confirms the 70% arrived.">
    <CreatorApplications picked />
    <ReceivedCard shown part="final" />
  </Phone>,
  <Panel key="record" title="Profile" label="Example: every finished deal goes on the profile.">
    <ProfileRecord />
  </Panel>,
];

function Steps({ section }: { section: ContentSection }) {
  return (
    <section className="hiw-steps" aria-labelledby={section.id}>
      <div className="hiw-head">
        <p className="v3-pill" data-rise>
          {section.parts.length} steps
        </p>
        <h2 id={section.id} className="v3-h2" data-rise style={nth(1)}>
          {section.title}
        </h2>
      </div>
      <ol className="hiw-step-list">
        {section.parts.map((part, i) => (
          <li
            key={part.id}
            className={i % 2 ? 'v3-side v3-side-flip hiw-step' : 'v3-side hiw-step'}
          >
            <div className="v3-side-copy">
              <p className="hiw-n" data-rise>
                Step {i + 1}
              </p>
              <h3 id={part.id} className="v3-h3 hiw-step-title" data-rise style={nth(1)}>
                {part.title}
              </h3>
              <div data-rise style={nth(2)}>
                <Markdown>{part.body}</Markdown>
              </div>
            </div>
            <div className="v3-side-show hiw-show" data-rise style={nth(1)}>
              {STEP_SCREENS[i] ?? null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Example({ section }: { section: ContentSection }) {
  return (
    <section className="hiw-band" aria-labelledby={section.id}>
      <div className="hiw-example" data-rise>
        <h2 id={section.id} className="v3-h2">
          {section.title}
        </h2>
        <Markdown>{section.intro}</Markdown>
      </div>
    </section>
  );
}

function Rules({ section }: { section: ContentSection }) {
  return (
    <section className="hiw-band" aria-labelledby={section.id}>
      <h2 id={section.id} className="v3-h2" data-rise>
        {section.title}
      </h2>
      <div className="hiw-rules" data-rise style={nth(1)}>
        <Markdown>{section.intro}</Markdown>
      </div>
    </section>
  );
}

function NotYet({ section }: { section: ContentSection }) {
  return (
    <section className="hiw-band" aria-labelledby={section.id}>
      <div className="hiw-intro">
        <h2 id={section.id} className="v3-h2" data-rise>
          {section.title}
        </h2>
        <div className="v3-lede hiw-lede" data-rise style={nth(1)}>
          <Markdown>{section.intro}</Markdown>
        </div>
      </div>
      <div className="hiw-notyet">
        {section.parts.map((part, i) => (
          <div key={part.id} className="hiw-card" data-rise style={nth(i)}>
            <h3 id={part.id} className="v3-h3">
              {part.title}
            </h3>
            <Markdown>{part.body}</Markdown>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhenWrong({ section }: { section: ContentSection }) {
  return (
    <section className="v3-cta hiw-wrong" aria-labelledby={section.id}>
      <div className="hiw-wrong-in">
        <h2 id={section.id} className="v3-h2" data-rise>
          {section.title}
        </h2>
        <div data-rise style={nth(1)}>
          <Markdown>{section.intro}</Markdown>
        </div>
        <div data-rise style={nth(2)}>
          <SignIn onDark />
        </div>
      </div>
    </section>
  );
}

/**
 * /how-it-works: the text of content/how-it-works.md, laid out like the home page. Each step sits
 * beside a picture of that moment in the product (HTML, made-up data, no people). The facts and the
 * figures are the same as on the home page.
 */
export function HowItWorksPage({ doc }: { doc: Doc }) {
  const root = useRef<HTMLDivElement>(null);
  useRiseIn(root);
  const [steps, example, rules, notYet, wrong, ...rest] = doc.sections;
  return (
    <div ref={root} className="v3-root">
      <SiteHeader />
      <main id="main">
        <header className="hiw-hero">
          <p className="v3-pill" data-rise>
            One brand, one creator, one fixed amount
          </p>
          <h1 className="v3-h1" data-rise style={nth(1)}>
            How it <em>works</em>
          </h1>
          {doc.lede ? (
            <p className="v3-lede hiw-hero-lede" data-rise style={nth(2)}>
              {doc.lede}
            </p>
          ) : null}
        </header>
        {steps ? <Steps section={steps} /> : null}
        {example ? <Example section={example} /> : null}
        {rules ? <Rules section={rules} /> : null}
        {notYet ? <NotYet section={notYet} /> : null}
        {rest.map((section) => (
          <section key={section.id} className="hiw-band" aria-labelledby={section.id}>
            <h2 id={section.id} className="v3-h2">
              {section.title}
            </h2>
            <Markdown>{section.intro}</Markdown>
          </section>
        ))}
        {wrong ? <WhenWrong section={wrong} /> : null}
      </main>
      <SiteFooter />
    </div>
  );
}
