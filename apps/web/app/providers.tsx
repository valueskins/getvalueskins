'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { ToastProvider } from '@/components/ui/Toast';
import { WakeApi } from '@/components/WakeApi';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A 4xx will not change on retry. Network errors and 5xx get two more tries.
        retry: (count, err) =>
          !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <WakeApi />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
