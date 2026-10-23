import type { MeResponse, MeOnboarding } from '@valueskins/shared';

type Step = MeOnboarding['steps'][number]['id'];

/** A GET /me body with obviously fake data. */
export function makeMe(
  options: {
    role?: 'CREATOR' | 'BRAND' | null;
    hasInstagram?: boolean;
    done?: Step[];
    email?: string | null;
    emailVerified?: boolean;
    profileDetails?: MeResponse['profileDetails'];
    isAdmin?: boolean;
    pendingEmail?: string | null;
  } = {},
): MeResponse {
  const role = options.role === undefined ? 'CREATOR' : options.role;
  const hasInstagram = options.hasInstagram ?? role !== null;
  const done = new Set<Step>(options.done ?? []);
  if (hasInstagram) done.add('instagram');

  const steps: MeOnboarding['steps'] = [
    { id: 'instagram', done: done.has('instagram'), required: true },
    { id: 'email', done: done.has('email'), required: true },
  ];
  if (role !== null) steps.push({ id: 'profile', done: done.has('profile'), required: true });
  if (role === 'BRAND') steps.push({ id: 'billing', done: done.has('billing'), required: true });
  if (role === 'CREATOR') steps.push({ id: 'payout', done: done.has('payout'), required: false });
  const next = steps.find((s) => s.required && !s.done)?.id ?? null;

  const email =
    options.email === undefined
      ? done.has('email')
        ? 'person@example.test'
        : null
      : options.email;
  return {
    user: {
      id: '0190a0e8-52b5-75d3-999f-4570bcd490e4',
      instagramUserId: hasInstagram ? 'ig-test-1' : null,
      username: role === 'BRAND' ? 'test.brand' : 'test.creator',
      role,
      isAdmin: options.isAdmin ?? false,
      onboardingCompletedAt: next === null ? '2026-10-01T05:00:00.000Z' : null,
      email,
      emailVerifiedAt:
        email && (options.emailVerified ?? done.has('email')) ? '2026-10-01T04:00:00.000Z' : null,
      pendingEmail: options.pendingEmail ?? null,
    },
    profile: hasInstagram
      ? {
          username: role === 'BRAND' ? 'test.brand' : 'test.creator',
          name: role === 'BRAND' ? 'Test Brand' : 'Test Creator',
          profilePictureUrl: null,
          followersCount: 48230,
          followsCount: 310,
          mediaCount: 312,
          engagementRate: 3.84,
          instagramSyncedAt: '2026-10-13T03:42:00.000Z',
          biography: 'A test bio.',
          accountType: role === 'BRAND' ? 'BUSINESS' : 'MEDIA_CREATOR',
        }
      : null,
    profileDetails:
      options.profileDetails !== undefined
        ? options.profileDetails
        : done.has('profile')
          ? role === 'BRAND'
            ? {
                name: 'Test Brand',
                city: 'Mumbai',
                age: null,
                gender: null,
                website: 'https://brand.example.test',
                pitch: 'We make test things.',
                lockedAt: '2026-10-09T06:00:00.000Z',
                adultConfirmedAt: '2026-10-09T06:00:00.000Z',
              }
            : {
                name: 'Test Creator',
                city: 'Pune',
                age: 24,
                gender: 'FEMALE',
                website: null,
                pitch: null,
                lockedAt: '2026-10-14T06:00:00.000Z',
                adultConfirmedAt: '2026-10-14T06:00:00.000Z',
              }
          : null,
    onboarding: { completed: next === null, nextStep: next, steps },
  };
}

export const CONFIG = {
  gstRateBps: 1800,
  minBudgetPaise: 88600,
  advancePercent: 30,
  authEmailEnabled: false,
  razorpayKeyId: 'rzp_test_fake',
  supportEmail: 'support@example.test',
  paymentsOpen: true,
  postingOpen: true,
};
