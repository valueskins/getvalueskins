import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { Component, type ReactElement, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';

/** Shows "404 page" where a component called notFound() (mocked in test/setup.ts). */
class NotFoundBoundary extends Component<{ children: ReactNode }, { notFound: boolean }> {
  state = { notFound: false };
  static getDerivedStateFromError(error: Error) {
    if (error.message === 'NEXT_NOT_FOUND') return { notFound: true };
    throw error;
  }
  render() {
    return this.state.notFound ? <p>404 page</p> : this.props.children;
  }
}

export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <NotFoundBoundary>{ui}</NotFoundBoundary>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { client, ...result };
}
