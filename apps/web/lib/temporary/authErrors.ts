import { ACCOUNT_TYPE_UNSUPPORTED } from '@valueskins/shared';

/** Error codes the API puts in ?error= when an Instagram sign-in or link fails. */
const MESSAGES: Record<string, string> = {
  state_invalid:
    'The sign-in expired or was opened in a different browser. Start again from the first page.',
  instagram_failed: 'Instagram sign-in did not complete. Start again.',
  account_type_unsupported: ACCOUNT_TYPE_UNSUPPORTED,
  account_type_change_blocked:
    'Your Instagram account type changed, but this account already has deals or applications. Write to our support address and we will sort it out.',
  must_be_logged_in: 'Sign in first, then link your Instagram account.',
  account_linked_elsewhere: 'That Instagram account is already linked to a different account.',
};

export const GENERIC_AUTH_ERROR = 'Something went wrong while signing in. Start again.';

export function authErrorMessage(code: string | undefined): string {
  if (code && Object.hasOwn(MESSAGES, code)) return MESSAGES[code]!;
  return GENERIC_AUTH_ERROR;
}
