import { vi } from 'vitest';

/** The state behind the next/navigation mock in test/setup.ts. Reset after each test. */
export const nav = {
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/',
  search: new URLSearchParams(),
};

export function setSearch(query: string) {
  nav.search = new URLSearchParams(query);
}

export function resetNav() {
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.pathname = '/';
  nav.search = new URLSearchParams();
}
