// Small per-tab notes the API does not keep for us. sessionStorage can be
// missing or throw (private mode, blocked storage), so every access is guarded
// and the pages work without it.

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Not available: the page falls back to its first state.
  }
}

/**
 * The address a verification link was last sent to. GET /me does not return it
 * (docs/WEB_API_GAPS.md), so "Check your inbox" is kept for this tab only.
 */
export const pendingEmail = {
  get: (userId: string) => read(`vs:pending-email:${userId}`),
  set: (userId: string, email: string | null) => write(`vs:pending-email:${userId}`, email),
};

/** Whether the user pressed "This is me" on the Instagram step. */
export const instagramConfirmed = {
  get: (userId: string) => read(`vs:ig-confirmed:${userId}`) === '1',
  set: (userId: string) => write(`vs:ig-confirmed:${userId}`, '1'),
};
