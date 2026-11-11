import { apiBaseUrl } from './env';

/**
 * The free Render instance sleeps after 15 minutes without traffic and takes about a minute to wake
 * (docs/DEPLOYMENT.md section 21.8). The web app asks `GET /healthz` once, on the first load of a
 * page and without waiting for it, so the API wakes while the visitor reads. That check never
 * touches the database, so a visitor who never signs in does not wake Neon (`GET /api/health`
 * queries it). The sign-in button then waits for the same answer when it has to.
 */

/** How long the sign-in button waits for the API before it gives up and offers "Try again". */
export const API_WAKE_TIMEOUT_MS = 60_000;
const POLL_MS = 2_000;
const ONE_ASK_MS = 15_000;

let started = false;
let answered = false;

function healthUrl(): string {
  return `${apiBaseUrl()}/healthz`;
}

/**
 * One health check. True only for the API's own answer: while it wakes, Render shows browsers a
 * loading page (not JSON, and without the API's CORS headers), and none of that counts.
 */
async function askOnce(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced, not only aborted: a request that hangs must still end this check on time.
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);
  });
  const ask = (async () => {
    try {
      const response = await fetch(healthUrl(), { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return false;
      const body = (await response.json()) as { ok?: unknown };
      return body.ok === true;
    } catch {
      return false;
    }
  })();
  try {
    return await Promise.race([ask, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** The wake-up call: at most once per page load, never awaited, never throws. */
export function wakeApi(): void {
  if (started) return;
  started = true;
  void askOnce(API_WAKE_TIMEOUT_MS).then((ok) => {
    if (ok) answered = true;
  });
}

/** True once the API has answered during this page load. */
export function apiHasAnswered(): boolean {
  return answered;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Asks until the API answers, or `timeoutMs` has passed. */
export async function waitForApi(timeoutMs: number = API_WAKE_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (answered) return true;
    const left = deadline - Date.now();
    if (left <= 0) return false;
    if (await askOnce(Math.min(left, ONE_ASK_MS))) {
      answered = true;
      return true;
    }
    await sleep(Math.min(POLL_MS, Math.max(deadline - Date.now(), 0)));
  }
}

/** For tests: forget that the API was asked or answered. */
export function resetWakeForTests(): void {
  started = false;
  answered = false;
}
