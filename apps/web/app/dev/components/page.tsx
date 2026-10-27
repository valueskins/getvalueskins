import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevLoginEnabled } from '@/lib/env';
import { ComponentSheet } from '@/components/dev/ComponentSheet';

export const metadata: Metadata = {
  title: 'Components',
  robots: { index: false, follow: false },
};

/**
 * Every shared component in every state, for design review. A 404 unless
 * NEXT_PUBLIC_ENABLE_DEV_LOGIN is "true", the same gate as /dev/login, and next.config.ts refuses
 * to build with that flag against the production API.
 */
export default function DevComponentsPage() {
  if (!isDevLoginEnabled()) notFound();
  return <ComponentSheet />;
}
