'use client';

import { LAUNCH_BANNER_BRAND, LAUNCH_BANNER_CREATOR, type MeResponse } from '@valueskins/shared';
import { Icon } from '@/components/ui/Icon';
import { useConfig } from '@/lib/api/queries';

/**
 * A quiet notice while deal posting is closed for this user (SPEC 19). The API decides, per user,
 * and says so in `postingOpen`: an admin sees nothing in `admins` mode. It waits for the config, so it
 * never flashes on for someone it does not apply to.
 */
export function LaunchBanner({ role }: { role: MeResponse['user']['role'] }) {
  const config = useConfig();
  if (config.data?.postingOpen !== false) return null;
  if (role !== 'BRAND' && role !== 'CREATOR') return null;
  return (
    <div className="launch-banner">
      <div className="banner" role="status">
        <div className="flex items-start gap-3">
          <Icon name="info" />
          <p className="t-body">{role === 'BRAND' ? LAUNCH_BANNER_BRAND : LAUNCH_BANNER_CREATOR}</p>
        </div>
      </div>
    </div>
  );
}
