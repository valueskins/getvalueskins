'use client';

import { RolePage } from '@/components/shell/RolePage';
import { ApplicationsPage } from '@/components/creator/ApplicationsPage';

export default function Page() {
  return (
    <RolePage role="CREATOR">
      <ApplicationsPage />
    </RolePage>
  );
}
