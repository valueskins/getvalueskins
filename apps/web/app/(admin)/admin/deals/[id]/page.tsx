'use client';

import { useParams } from 'next/navigation';
import { AdminDealPage } from '@/components/admin/AdminDealPage';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <AdminDealPage id={params?.id ?? ''} />;
}
