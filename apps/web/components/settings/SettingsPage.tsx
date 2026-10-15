'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { MeResponse } from '@valueskins/shared';
import { useMe } from '@/lib/api/queries';
import { Callout } from '@/components/ui/Callout';
import { cx } from '@/components/ui/cx';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { BillingPanel } from './BillingPanel';
import { DeletePanel } from './DeletePanel';
import { EmailPanel } from './EmailPanel';
import { InstagramPanel } from './InstagramPanel';
import { ProfilePanel } from './ProfilePanel';
import { UpiPanel } from './UpiPanel';

/** The API sends a failed Instagram link here (SPEC 6.1). */
const LINK_ERRORS: Record<string, string> = {
  account_linked_elsewhere:
    'That Instagram account is already linked to a different ValueSkins account.',
};

function sectionsFor(me: MeResponse) {
  return [
    { id: 'email', label: 'Email' },
    { id: 'profile', label: 'Profile' },
    me.user.role === 'BRAND'
      ? { id: 'billing', label: 'Billing details' }
      : { id: 'upi', label: 'Get paid by UPI' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'delete', label: 'Delete account' },
  ];
}

/** Highlights the section in view, where the browser can tell. */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  const key = ids.join(',');
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

export function SettingsPage() {
  const me = useMe();
  const error = useSearchParams()?.get('error') ?? null;
  const data = me.data;
  const sections = data ? sectionsFor(data) : [];
  const active = useActiveSection(sections.map((s) => s.id));

  if (!data) return <PageSkeleton />;
  const linkError = error
    ? (LINK_ERRORS[error] ?? 'Connecting Instagram did not finish. Try again.')
    : null;

  return (
    <div className="page">
      <h1 className="t-h1 mb-6">Settings</h1>
      {linkError ? (
        <Callout tone="error" role="alert" className="mb-6">
          <p>{linkError}</p>
        </Callout>
      ) : null}
      <div className="grid items-start gap-8 md:grid-cols-[220px_minmax(0,1fr)] md:gap-12">
        <nav className="side-nav sticky top-6 hidden md:flex" aria-label="Settings sections">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cx(active === s.id && 'is-active')}
              aria-current={active === s.id ? 'true' : undefined}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 max-w-[760px] flex-col gap-6">
          <EmailPanel me={data} />
          <ProfilePanel me={data} />
          {data.user.role === 'BRAND' ? <BillingPanel /> : <UpiPanel />}
          <InstagramPanel me={data} />
          <DeletePanel me={data} />
        </div>
      </div>
    </div>
  );
}
