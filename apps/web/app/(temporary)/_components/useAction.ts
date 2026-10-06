'use client';

import { useState } from 'react';

/**
 * Runs a form submit: `fn` returns an error message to show, or null on
 * success. Tracks the busy flag and the message so each form stays small.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<string | null>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const message = await fn();
      setError(message);
      return message === null;
    } catch {
      setError('Could not reach the server. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}
