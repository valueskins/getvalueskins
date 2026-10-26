'use client';

import { useState } from 'react';
import type { DealStatus } from '@valueskins/shared';
import { STATUS_BADGE, STATUS_LABEL } from '@/lib/dealStatus';
import { Badge } from '@/components/ui/Callout';

/**
 * The deal's status. When it changes while the page is open (a realtime update, or the viewer's
 * own action), the new badge plays a short pop so the change is noticed. The first render does not.
 */
export function StatusBadge({ status }: { status: DealStatus }) {
  const [shown, setShown] = useState(status);
  const [changed, setChanged] = useState(false);
  if (status !== shown) {
    setShown(status);
    setChanged(true);
  }
  return (
    <Badge key={status} kind={STATUS_BADGE[status]} className={changed ? 'is-changed' : undefined}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
