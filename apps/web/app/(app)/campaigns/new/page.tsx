'use client';

import { RolePage } from '@/components/shell/RolePage';
import { DealForm } from '@/components/brand/DealForm';

export default function Page() {
  return (
    <RolePage role="BRAND">
      <DealForm draft={null} />
    </RolePage>
  );
}
