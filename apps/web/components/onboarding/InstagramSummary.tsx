import type { MeProfile } from '@valueskins/shared';
import { formatCount, formatPercent } from '@/lib/format';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Callout';

export function accountTypeLabel(type: string | null | undefined): string | null {
  const t = type?.toUpperCase();
  if (t === 'BUSINESS') return 'Business account';
  if (t === 'MEDIA_CREATOR') return 'Creator account';
  return null;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <p className="stat-n">{value}</p>
      <p className="stat-l">{label}</p>
    </div>
  );
}

export function hasInstagramStats(profile: MeProfile): boolean {
  return (
    profile.followersCount !== null ||
    profile.mediaCount !== null ||
    profile.engagementRate !== null
  );
}

/** Followers, posts and engagement, as read from Instagram. A number Instagram did not give is left out. */
export function InstagramStats({ profile }: { profile: MeProfile }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {profile.followersCount !== null ? (
        <Stat value={formatCount(profile.followersCount)} label="Followers" />
      ) : null}
      {profile.mediaCount !== null ? (
        <Stat value={formatCount(profile.mediaCount)} label="Posts" />
      ) : null}
      {profile.engagementRate !== null ? (
        <Stat value={formatPercent(profile.engagementRate)} label="Engagement" />
      ) : null}
    </div>
  );
}

/** The details read from Instagram, for "Is this you?". */
export function InstagramSummary({ profile }: { profile: MeProfile }) {
  const type = accountTypeLabel(profile.accountType);
  return (
    <div className="card flex flex-col">
      <div className="flex items-center gap-4 p-5 md:p-6">
        <Avatar name={profile.username} src={profile.profilePictureUrl} size={64} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="t-h3">{profile.name}</p>
          <p className="t-body c-ink-2">@{profile.username}</p>
          {type ? (
            <Badge kind="progress" className="self-start">
              {type}
            </Badge>
          ) : null}
        </div>
      </div>
      {hasInstagramStats(profile) ? (
        <>
          <div className="hr" />
          <div className="p-5 md:p-6">
            <InstagramStats profile={profile} />
          </div>
        </>
      ) : null}
      {profile.biography ? (
        <>
          <div className="hr" />
          <div className="flex flex-col gap-1 p-5 md:p-6">
            <p className="t-label c-ink-2">Bio</p>
            <p className="t-body whitespace-pre-line">{profile.biography}</p>
          </div>
        </>
      ) : null}
      <div className="border-t border-border bg-sunken px-5 py-3 md:px-6">
        <p className="t-small c-ink-2">
          Engagement is the average likes and comments on your last 12 posts, divided by your
          followers.
        </p>
      </div>
    </div>
  );
}
