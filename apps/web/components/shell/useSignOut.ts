'use client';

import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { useLogout } from '@/lib/api/queries';
import { useToast } from '@/components/ui/Toast';
import { errorText } from '@/lib/api/errors';

/** Shown next to every sign-out control while the request runs. */
export const SIGNING_OUT_REASON = 'Signing you out.';

// One sign-out per page, shared by every control that offers it (the desktop menu, the phone sheet,
// the setup bar, "Not you? Sign out"). Several can be mounted at once, and a quick second click
// lands before React re-renders, so the flag lives outside any one component.
let signingOut = false;
const listeners = new Set<() => void>();
function setSigningOut(value: boolean) {
  signingOut = value;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Signs out once, then goes to the home page. The cache is cleared even if the call fails. */
export function useSignOut() {
  const router = useRouter();
  const logout = useLogout();
  const toast = useToast();
  const pending = useSyncExternalStore(
    subscribe,
    () => signingOut,
    () => false,
  );
  return {
    pending,
    signOut: () => {
      if (signingOut) return;
      setSigningOut(true);
      logout
        .mutateAsync()
        .then(
          () => router.replace('/'),
          (err: unknown) => {
            toast.show({ tone: 'error', title: 'Sign-out did not finish', text: errorText(err) });
            router.replace('/');
          },
        )
        .finally(() => setSigningOut(false));
    },
  };
}
