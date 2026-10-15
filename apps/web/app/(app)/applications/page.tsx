'use client';

import { PageIntro, RolePage } from '@/components/shell/RolePage';

export default function Page() {
  return (
    <RolePage role="CREATOR">
      <PageIntro
        title="Applications"
        lede="The deals you applied to, and whether the brand picked you."
      />
    </RolePage>
  );
}
