'use client';

import { RolePage } from '@/components/shell/RolePage';
import { MyDealsPage } from '@/components/creator/MyDealsPage';

export default function Page() {
  return (
    <RolePage role="CREATOR">
      <MyDealsPage />
    </RolePage>
  );
}
