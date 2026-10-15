'use client';

import { RolePage } from '@/components/shell/RolePage';
import { CampaignsPage } from '@/components/brand/CampaignsPage';

export default function Page() {
  return (
    <RolePage role="BRAND">
      <CampaignsPage />
    </RolePage>
  );
}
