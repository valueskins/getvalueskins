import type { ResumeResponse } from '@valueskins/shared';
import { formatCount, formatDate, formatMonthYear, formatPercent } from '@/lib/format';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { Money } from '@/components/ui/Money';
import { Skeleton } from '@/components/ui/Skeleton';
import { accountTypeLabel } from '@/components/onboarding/InstagramSummary';
import { GENDER_LABELS } from '@/components/forms/ProfileForm';

const DELETED_USER = 'Deleted user';

/** One fact on the card. Numbers use tabular figures in the text face, so they line up. */
function Cell({ k, v, num }: { k: string; v: string; num?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="resume-k">{k}</p>
      <p className={num ? 'resume-v is-num' : 'resume-v'}>{v}</p>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** The resume (SPEC 11, REPLACEMENT_PLAN 2.5). A field that is not saved yet is left out, never shown blank. */
export function ResumeContent({ data, titleId }: { data: ResumeResponse; titleId?: string }) {
  const u = data.user;
  const isBrand = u.role === 'BRAND';
  const type = accountTypeLabel(u.igAccountType);
  const cells: Array<{ k: string; v: string; num?: boolean }> = [];
  if (u.city) cells.push({ k: 'City', v: u.city });
  if (!isBrand && u.age !== null) cells.push({ k: 'Age', v: String(u.age), num: true });
  if (!isBrand && u.gender) cells.push({ k: 'Gender', v: GENDER_LABELS[u.gender] });
  if (u.followersCount !== null)
    cells.push({ k: 'Followers', v: formatCount(u.followersCount), num: true });
  if (u.engagementRate !== null)
    cells.push({ k: 'Engagement', v: formatPercent(u.engagementRate), num: true });

  return (
    <>
      <div className="resume-head">
        <Avatar name={u.username} src={u.profilePictureUrl} size={56} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p id={titleId} className="t-body truncate font-medium">
            {u.name}
          </p>
          {u.instagramVerified ? (
            <a
              href={`https://www.instagram.com/${encodeURIComponent(u.username)}/`}
              target="_blank"
              rel="noreferrer"
              className="t-small inline-flex items-center gap-1"
            >
              @{u.username}
              <span className="c-ink-2">on Instagram</span>
              <Icon name="arrowSquareOut" size={16} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <p className="t-small c-ink-2">@{u.username}</p>
          )}
        </div>
      </div>
      {type || cells.length ? (
        <div className="resume-sec flex flex-col gap-3">
          {type ? (
            <Badge kind="progress" className="self-start">
              {type}
            </Badge>
          ) : null}
          {cells.length ? (
            <div className="resume-grid">
              {cells.map((c) => (
                <Cell key={c.k} {...c} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {isBrand && (u.website || u.pitch) ? (
        <div className="resume-sec flex flex-col gap-2">
          {u.website ? (
            <div>
              <p className="resume-k">Website</p>
              <a href={u.website} target="_blank" rel="noreferrer" className="t-small break-all">
                {hostOf(u.website)}
              </a>
            </div>
          ) : null}
          {u.pitch ? (
            <div>
              <p className="resume-k">Hiring pitch</p>
              <p className="t-small c-ink-2 whitespace-pre-line">{u.pitch}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {u.contactEmail ? (
        <div className="resume-sec">
          <p className="t-small">
            Contact: <a href={`mailto:${u.contactEmail}`}>{u.contactEmail}</a>
          </p>
        </div>
      ) : null}
      <div className="resume-sec">
        <div className="resume-grid">
          <Cell k="Completed deals" v={String(data.stats.completedDealsCount)} num />
          <div className="min-w-0">
            <p className="resume-k">Total deal value</p>
            <p className="resume-v">
              <Money paise={data.stats.totalValuePaise} size="s" />
            </p>
          </div>
          <Cell k="Member since" v={formatMonthYear(u.memberSince)} />
        </div>
      </div>
      <div className="resume-sec">
        {data.completedDeals.length ? (
          <>
            <p className="resume-k mb-2">Recent completed deals</p>
            <ul className="resume-deals">
              {data.completedDeals.map((d, i) => (
                <li key={`${d.counterparty.id}-${d.completedAt}-${i}`}>
                  <span className="t">{d.title}</span>
                  <span className="m">
                    <Money paise={d.budgetPaise} size="s" />
                  </span>
                  <span className="s">
                    {d.counterparty.username === DELETED_USER
                      ? DELETED_USER
                      : `@${d.counterparty.username}`}
                    , {formatDate(d.completedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="t-small c-ink-2">No completed deals yet.</p>
        )}
      </div>
    </>
  );
}

export function ResumeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading profile">
      <div className="resume-head">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="resume-sec flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function ResumeUnavailable() {
  return (
    <div className="resume-sec border-t-0">
      <p className="t-small c-ink-2">
        This profile is not available. The account may have been deleted.
      </p>
    </div>
  );
}
