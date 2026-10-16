'use client';

import { useParams } from 'next/navigation';
import { AdminDisputePage } from '@/components/admin/AdminDisputePage';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <AdminDisputePage id={params?.id ?? ''} />;
}
