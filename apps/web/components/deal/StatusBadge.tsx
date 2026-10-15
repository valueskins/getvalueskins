import type { DealStatus } from '@valueskins/shared';
import { STATUS_BADGE, STATUS_LABEL } from '@/lib/dealStatus';
import { Badge } from '@/components/ui/Callout';

export function StatusBadge({ status }: { status: DealStatus }) {
  return <Badge kind={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>;
}
