import { describe, expect, it } from 'vitest';
import { type OnboardingInput, computeOnboarding } from './onboarding.js';

const base: OnboardingInput = {
  hasInstagram: true,
  role: 'CREATOR',
  emailVerified: false,
  hasProfile: false,
  hasBilling: false,
  hasPayoutDetails: false,
};

const emailOnly: OnboardingInput = {
  ...base,
  hasInstagram: false,
  role: null,
  emailVerified: true,
};

const ids = (input: OnboardingInput) => computeOnboarding(input).steps.map((s) => s.id);

describe('computeOnboarding: Instagram sign-in', () => {
  it('asks for the email, then the profile, then the creator UPI step, with no role step', () => {
    expect(ids(base)).toEqual(['instagram', 'email', 'profile', 'payout']);
    expect(computeOnboarding(base).nextStep).toBe('email');
    expect(computeOnboarding({ ...base, emailVerified: true }).nextStep).toBe('profile');
  });

  it('a creator is complete with a verified email and a saved profile; UPI is optional', () => {
    const state = computeOnboarding({ ...base, emailVerified: true, hasProfile: true });
    expect(state.completed).toBe(true);
    expect(state.nextStep).toBeNull();
    expect(state.steps.find((s) => s.id === 'payout')).toEqual({
      id: 'payout',
      done: false,
      required: false,
    });
  });

  it('a brand also needs billing, after the profile', () => {
    const brand = { ...base, role: 'BRAND' as const, emailVerified: true };
    expect(ids(brand)).toEqual(['instagram', 'email', 'profile', 'billing']);
    expect(computeOnboarding(brand).nextStep).toBe('profile');

    const noBilling = computeOnboarding({ ...brand, hasProfile: true });
    expect(noBilling.completed).toBe(false);
    expect(noBilling.nextStep).toBe('billing');

    expect(computeOnboarding({ ...brand, hasProfile: true, hasBilling: true }).completed).toBe(
      true,
    );
  });
});

describe('computeOnboarding: email sign-in', () => {
  it('cannot finish until Instagram is connected, whatever else is done', () => {
    const state = computeOnboarding(emailOnly);
    expect(ids(emailOnly)).toEqual(['instagram', 'email']);
    expect(state.completed).toBe(false);
    expect(state.nextStep).toBe('instagram');
  });

  it('has no role-dependent steps while the role is unknown', () => {
    expect(ids(emailOnly)).not.toContain('profile');
    expect(ids(emailOnly)).not.toContain('billing');
    expect(ids(emailOnly)).not.toContain('payout');
  });

  it('linking Instagram gives the role, so the profile step appears', () => {
    const linked = { ...emailOnly, hasInstagram: true, role: 'BRAND' as const };
    expect(ids(linked)).toEqual(['instagram', 'email', 'profile', 'billing']);
    expect(computeOnboarding(linked).nextStep).toBe('profile');
  });
});

describe('computeOnboarding: payout step', () => {
  it('is done once the UPI ID, name and consent are saved, and never required', () => {
    const ready = { ...base, emailVerified: true, hasProfile: true };
    const step = (hasPayoutDetails: boolean) =>
      computeOnboarding({ ...ready, hasPayoutDetails }).steps.find((s) => s.id === 'payout');

    expect(step(false)).toEqual({ id: 'payout', done: false, required: false });
    expect(step(true)).toEqual({ id: 'payout', done: true, required: false });
    expect(computeOnboarding({ ...ready, hasPayoutDetails: false }).completed).toBe(true);
  });

  it('never appears for a brand', () => {
    expect(ids({ ...base, role: 'BRAND' })).not.toContain('payout');
  });
});
