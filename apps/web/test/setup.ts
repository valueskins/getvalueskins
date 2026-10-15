import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { resetNav } from './helpers/nav';
import { resetSockets } from './helpers/socket';

// No real socket in tests: io() returns a FakeSocket a test can drive.
vi.mock('socket.io-client', async () => {
  const { FakeSocket, sockets } = await import('./helpers/socket');
  return {
    io: (...args: unknown[]) => {
      const socket = new FakeSocket();
      sockets.last = socket;
      sockets.args.push(args);
      return socket;
    },
  };
});

vi.mock('next/navigation', async (importOriginal) => {
  const { nav } = await import('./helpers/nav');
  return {
    ...(await importOriginal<typeof import('next/navigation')>()),
    useRouter: () => ({
      replace: nav.replace,
      push: nav.push,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => nav.pathname,
    useSearchParams: () => nav.search,
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND');
    },
  };
});

// notFound() is expected in some tests; React reports the caught error on the console.
const consoleError = console.error.bind(console);
vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  const text = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
  if (text.includes('NEXT_NOT_FOUND') || text.includes('NotFoundBoundary')) return;
  consoleError(...args);
});

// Vitest globals are off, so Testing Library does not auto-clean between tests.
afterEach(() => {
  cleanup();
  resetNav();
  resetSockets();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  try {
    window.sessionStorage.clear();
  } catch {
    // jsdom always has it; nothing to do otherwise.
  }
});
