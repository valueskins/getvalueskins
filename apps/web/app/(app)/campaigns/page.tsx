'use client';

import { PageIntro, RolePage } from '@/components/shell/RolePage';

export default function Page() {
  return (
    <RolePage role="BRAND">
      <PageIntro title="Campaigns" lede="Your deals, from drafts to completed." />
    </RolePage>
  );
}
