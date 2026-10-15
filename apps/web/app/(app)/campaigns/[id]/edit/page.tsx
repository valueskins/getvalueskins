'use client';

import { useParams } from 'next/navigation';
import { RolePage } from '@/components/shell/RolePage';
import { EditDraftPage } from '@/components/brand/EditDraftPage';

export default function Page() {
  const params = useParams<{ id: string }>();
  return (
    <RolePage role="BRAND">
      <EditDraftPage id={params?.id ?? ''} />
    </RolePage>
  );
}
