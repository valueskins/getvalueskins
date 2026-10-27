import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevLoginEnabled } from '@/lib/env';

export const metadata: Metadata = { title: 'Error page', robots: { index: false, follow: false } };

/**
 * Throws on purpose, to show the error page (app/error.tsx) for design review. A 404 unless
 * NEXT_PUBLIC_ENABLE_DEV_LOGIN is "true", the same gate as /dev/login and /dev/components.
 */
export default function DevErrorPage() {
  if (!isDevLoginEnabled()) notFound();
  throw new Error('A test error for the error page.');
}
