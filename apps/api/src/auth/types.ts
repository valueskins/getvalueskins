import type { UserRole } from '@valueskins/shared';

/** Curated — never the raw users row, never the encrypted Instagram token. */
export interface AuthenticatedUser {
  id: string;
  instagramUserId: string | null;
  username: string;
  role: UserRole | null;
  isAdmin: boolean;
  onboardingCompletedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
}

// Express's own types are declared via a namespace, so augmenting Request
// requires the same pattern — there's no ES module alternative here.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
