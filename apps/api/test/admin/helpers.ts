import { createUserWithSession } from '../helpers/auth.js';

/** An admin account. Admin routes check only the flag, not the role or onboarding. */
export function adminUser() {
  return createUserWithSession({
    isAdmin: true,
    email: `admin-${Math.random().toString(36).slice(2)}@example.com`,
    emailVerifiedAt: new Date(),
    onboardingCompletedAt: new Date(),
  });
}
