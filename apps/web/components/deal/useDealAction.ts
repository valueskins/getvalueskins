'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { refreshDeal } from '@/lib/api/deals';
import { dealErrorText } from '@/lib/dealErrors';
import { useRealtime } from '@/components/realtime/RealtimeProvider';
import { useToast } from '@/components/ui/Toast';

/**
 * Runs one deal action. It marks the action as the viewer's own (so its live
 * echo does not toast), shows a failure in plain words (DlEdge), and re-reads
 * the deal when someone else acted first.
 */
export function useDealAction(dealId: string) {
  const client = useQueryClient();
  const toast = useToast();
  const { noteOwnAction } = useRealtime();

  return useCallback(
    async <T>(
      run: () => Promise<T>,
      options: {
        success?: { title: string; text?: string };
        context?: 'record' | 'dispute' | 'other';
      } = {},
    ): Promise<T | undefined> => {
      noteOwnAction(dealId);
      try {
        const result = await run();
        if (options.success) toast.show({ tone: 'ok', ...options.success });
        return result;
      } catch (err) {
        const e = dealErrorText(err, options.context);
        toast.show({ tone: 'error', title: e.title, text: e.text });
        if (e.reload) refreshDeal(client, dealId);
        return undefined;
      }
    },
    [client, dealId, noteOwnAction, toast],
  );
}
