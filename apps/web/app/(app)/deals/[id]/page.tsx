'use client';

import { useParams } from 'next/navigation';
import { DealPage } from '@/components/deal/DealPage';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <DealPage id={params?.id ?? ''} />;
}
