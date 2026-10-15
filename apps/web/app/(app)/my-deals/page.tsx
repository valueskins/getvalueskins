'use client';

import { PageIntro, RolePage } from '@/components/shell/RolePage';

export default function Page() {
  return (
    <RolePage role="CREATOR">
      <PageIntro title="My deals" lede="Deals where a brand confirmed you." />
    </RolePage>
  );
}
