'use client';

import { countdown } from '@/lib/deadlines';
import { Badge } from '@/components/ui/Callout';
import { useNow } from './useNow';

/** "8 days left", hours under a day, red when overdue. */
export function DeadlineBadge({ date }: { date: string }) {
  const now = useNow();
  const c = countdown(date, now);
  return <Badge kind={c.overdue ? 'error' : c.soon ? 'wait' : 'draft'}>{c.text}</Badge>;
}
