'use client';

import { useEffect } from 'react';
import { wakeApi } from '@/lib/wake';

/** Wakes the API on the first load of any page (see lib/wake.ts). Renders nothing. */
export function WakeApi() {
  useEffect(() => {
    wakeApi();
  }, []);
  return null;
}
