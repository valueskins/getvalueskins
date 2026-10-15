'use client';

import { PageIntro, RolePage } from '@/components/shell/RolePage';

export default function Page() {
  return (
    <RolePage role="CREATOR">
      <PageIntro
        title="Deals"
        lede="Open deals from brands. Apply to any you can deliver on time."
      />
    </RolePage>
  );
}
