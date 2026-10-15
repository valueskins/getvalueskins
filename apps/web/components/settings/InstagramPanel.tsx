import type { MeResponse } from '@valueskins/shared';
import { formatDateTime } from '@/lib/format';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { accountTypeLabel, InstagramStats } from '@/components/onboarding/InstagramSummary';
import { Panel } from './Rows';

export function InstagramPanel({ me }: { me: MeResponse }) {
  const p = me.profile;
  return (
    <Panel
      id="instagram"
      title="Instagram"
      action={
        p ? (
          <a
            href={`https://www.instagram.com/${encodeURIComponent(p.username)}/`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-text btn-sm"
          >
            Open on Instagram
            <Icon name="arrowSquareOut" size={16} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null
      }
    >
      {p ? (
        <>
          <div className="flex items-center gap-3.5">
            <Avatar name={p.username} src={p.profilePictureUrl} size={56} />
            <div className="flex flex-col gap-0.5">
              <p className="t-body font-medium">@{p.username}</p>
              {accountTypeLabel(p.accountType) ? (
                <Badge kind="progress" className="self-start">
                  {accountTypeLabel(p.accountType)}
                </Badge>
              ) : null}
            </div>
          </div>
          <InstagramStats profile={p} />
          <p className="t-small c-ink-2">
            {p.instagramSyncedAt
              ? `Updated from Instagram on ${formatDateTime(p.instagramSyncedAt)}. `
              : null}
            Your role on ValueSkins comes from your Instagram account type.
          </p>
        </>
      ) : (
        <p className="t-body c-ink-2">No Instagram account is connected.</p>
      )}
    </Panel>
  );
}
