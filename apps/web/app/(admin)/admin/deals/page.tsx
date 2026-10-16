'use client';

import { Suspense } from 'react';
import { AdminDealsPage } from '@/components/admin/AdminDealsPage';

export default function Page() {
  return (
    <Suspense>
      <AdminDealsPage />
    </Suspense>
  );
}
