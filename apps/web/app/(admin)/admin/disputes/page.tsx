'use client';

import { Suspense } from 'react';
import { AdminDisputesPage } from '@/components/admin/AdminDisputesPage';

export default function Page() {
  return (
    <Suspense>
      <AdminDisputesPage />
    </Suspense>
  );
}
