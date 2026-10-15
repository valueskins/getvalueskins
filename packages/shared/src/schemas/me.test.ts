import { describe, expect, it } from 'vitest';
import { meResponseSchema } from './me.js';

const onboarding = {
  completed: false,
  nextStep: 'email',
  steps: [
    { id: 'instagram', done: true, required: true },
    { id: 'email', done: false, required: true },
  ],
};

const user = {
  id: '01a0e8e8-52b5-75d3-999f-4570bcd490e4',
  instagramUserId: 'ig-1',
  username: 'creator',
  role: 'CREATOR',
  isAdmin: false,
  onboardingCompletedAt: null,
  email: null,
  emailVerifiedAt: null,
};

describe('meResponseSchema', () => {
  it('accepts a user with an Instagram profile', () => {
    const result = meResponseSchema.safeParse({
      user,
      profile: {
        username: 'creator',
        name: 'Creator Name',
        profilePictureUrl: 'https://example.com/pic.jpg',
        followersCount: 5000,
        followsCount: 100,
        mediaCount: 40,
        engagementRate: 3.25,
        instagramSyncedAt: '2026-10-01T10:00:00.000Z',
      },
      profileDetails: null,
      onboarding,
    });
    expect(result.success).toBe(true);
  });

  it('gives the Instagram bio and account type, and defaults them to null for an older body', () => {
    const base = {
      username: 'creator',
      name: 'Creator Name',
      profilePictureUrl: null,
      followersCount: 1,
      followsCount: 1,
      mediaCount: 1,
      engagementRate: null,
      instagramSyncedAt: null,
    };
    const parse = (profile: object) =>
      meResponseSchema.parse({ user, profile, profileDetails: null, onboarding }).profile;
    expect(
      parse({ ...base, biography: 'Food and travel', accountType: 'MEDIA_CREATOR' }),
    ).toMatchObject({
      biography: 'Food and travel',
      accountType: 'MEDIA_CREATOR',
    });
    expect(parse(base)).toMatchObject({ biography: null, accountType: null });
  });

  it('accepts locked profile details with the current age', () => {
    const result = meResponseSchema.safeParse({
      user,
      profile: null,
      profileDetails: {
        name: 'Asha Rao',
        city: 'Pune',
        age: 25,
        gender: 'FEMALE',
        website: null,
        pitch: null,
        lockedAt: '2026-10-01T10:00:00.000Z',
      },
      onboarding,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an email-only user with a null profile', () => {
    const result = meResponseSchema.safeParse({
      user: { ...user, instagramUserId: null, role: null, email: 'a@example.com' },
      profile: null,
      profileDetails: null,
      onboarding,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a response with no profile key', () => {
    expect(meResponseSchema.safeParse({ user, profileDetails: null, onboarding }).success).toBe(
      false,
    );
  });

  it('rejects an unknown role', () => {
    expect(
      meResponseSchema.safeParse({
        user: { ...user, role: 'ADMIN' },
        profile: null,
        profileDetails: null,
        onboarding,
      }).success,
    ).toBe(false);
  });

  it('rejects a response with no onboarding object', () => {
    expect(meResponseSchema.safeParse({ user, profile: null, profileDetails: null }).success).toBe(
      false,
    );
  });

  it('rejects an unknown onboarding step', () => {
    expect(
      meResponseSchema.safeParse({
        user,
        profile: null,
        profileDetails: null,
        onboarding: { ...onboarding, nextStep: 'marketplace' },
      }).success,
    ).toBe(false);
  });
});
