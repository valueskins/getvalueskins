'use client';

import { RolePage } from '@/components/shell/RolePage';
import { FeedPage } from '@/components/creator/FeedPage';

export default function Page() {
  return (
    <RolePage role="CREATOR">
      <FeedPage />
    </RolePage>
  );
}
