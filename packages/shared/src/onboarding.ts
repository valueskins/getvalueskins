import type { UserRole } from './enums.js';

/** Steps in the order they are asked (SPEC 6.4, REPLACEMENT_PLAN 2.4). */
export const ONBOARDING_STEPS = ['instagram', 'email', 'profile', 'billing', 'payout'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingInput {
  /** True once an Instagram account is linked (Instagram sign-in, or linked later). */
  hasInstagram: boolean;
  /** Set from the Instagram account type, so null only for an email-only account with no Instagram. */
  role: UserRole | null;
  emailVerified: boolean;
  /** The profile details are saved (and locked). */
  hasProfile: boolean;
  hasBilling: boolean;
  /** The UPI ID, the name on the account and the consent are all saved (REPLACEMENT_PLAN 2.1). */
  hasPayoutDetails: boolean;
}

export interface OnboardingStepState {
  id: OnboardingStep;
  done: boolean;
  /** Required steps gate onboarding_completed_at. Payout is a step but not required (SPEC 6.4). */
  required: boolean;
}

export interface OnboardingState {
  completed: boolean;
  /** First required step that is not done, or null when onboarding is complete. */
  nextStep: OnboardingStep | null;
  /** Only the steps that apply to this user, in order. */
  steps: OnboardingStepState[];
}

/**
 * Pure: which onboarding steps apply to a user, which are done, and which is
 * next. Used by the API (to set onboarding_completed_at and to answer GET /me)
 * and by the web app. The role comes from the Instagram account type, so an
 * email-only account has no role-dependent steps and cannot finish until it
 * connects Instagram (REPLACEMENT_PLAN 2.3).
 */
export function computeOnboarding(input: OnboardingInput): OnboardingState {
  const steps: OnboardingStepState[] = [
    { id: 'instagram', done: input.hasInstagram, required: true },
    { id: 'email', done: input.emailVerified, required: true },
  ];
  if (input.role !== null) {
    steps.push({ id: 'profile', done: input.hasProfile, required: true });
  }
  if (input.role === 'BRAND') {
    steps.push({ id: 'billing', done: input.hasBilling, required: true });
  }
  if (input.role === 'CREATOR') {
    steps.push({ id: 'payout', done: input.hasPayoutDetails, required: false });
  }

  const nextRequired = steps.find((step) => step.required && !step.done);

  return {
    completed: nextRequired === undefined,
    nextStep: nextRequired?.id ?? null,
    steps,
  };
}
