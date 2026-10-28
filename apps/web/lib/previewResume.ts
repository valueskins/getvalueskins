import type { MeResponse, ResumeResponse, UserGender } from '@valueskins/shared';

/** What the person has typed into the profile step so far, before it is saved. */
export interface ProfileDraft {
  name: string;
  city: string;
  age: number | null;
  gender: UserGender | null;
  website: string;
  pitch: string;
}

const blank = (value: string | null | undefined) => {
  const v = value?.trim() ?? '';
  return v === '' ? null : v;
};

/**
 * The profile card as others will see it (GET /users/:id/resume, SPEC 11), built from GET /me and
 * what is being typed, so onboarding can show it live. A new account has no completed deals yet.
 */
export function previewResume(
  me: MeResponse,
  draft: ProfileDraft | null,
  now: Date = new Date(),
): ResumeResponse {
  const saved = me.profileDetails;
  const isBrand = me.user.role === 'BRAND';
  const name = blank(draft?.name) ?? saved?.name ?? me.profile?.name ?? me.user.username;
  return {
    user: {
      id: me.user.id,
      role: me.user.role ?? 'CREATOR',
      username: me.profile?.username ?? me.user.username,
      name,
      profilePictureUrl: me.profile?.profilePictureUrl ?? null,
      instagramVerified: me.profile !== null,
      igAccountType: me.profile?.accountType ?? null,
      followersCount: me.profile?.followersCount ?? null,
      engagementRate: me.profile?.engagementRate ?? null,
      city: blank(draft?.city) ?? saved?.city ?? null,
      age: isBrand ? null : (draft?.age ?? saved?.age ?? null),
      gender: isBrand ? null : (draft?.gender ?? saved?.gender ?? null),
      website: isBrand ? (blank(draft?.website) ?? saved?.website ?? null) : null,
      pitch: isBrand ? (blank(draft?.pitch) ?? saved?.pitch ?? null) : null,
      contactEmail: me.user.emailVerifiedAt ? me.user.email : null,
      memberSince: now.toISOString(),
    },
    stats: { completedDealsCount: 0, totalValuePaise: 0 },
    completedDeals: [],
  };
}
