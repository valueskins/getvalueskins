'use client';

import { PageIntro, RolePage } from '@/components/shell/RolePage';

export default function Page() {
  return (
    <RolePage role="BRAND">
      <PageIntro
        title="Post a deal"
        lede="Write the brief, set the amount and the dates, then publish."
      />
    </RolePage>
  );
}
