'use client';

import { useRouter } from 'next/navigation';
import { useLogout } from '@/lib/api/queries';
import { useToast } from '@/components/ui/Toast';
import { errorText } from '@/lib/api/errors';

/** Signs out, then goes to the home page. The cache is cleared even if the call fails. */
export function useSignOut() {
  const router = useRouter();
  const logout = useLogout();
  const toast = useToast();
  return {
    pending: logout.isPending,
    signOut: () =>
      logout.mutate(undefined, {
        onSuccess: () => router.replace('/'),
        onError: (err) => {
          toast.show({ tone: 'error', title: 'Sign-out did not finish', text: errorText(err) });
          router.replace('/');
        },
      }),
  };
}
