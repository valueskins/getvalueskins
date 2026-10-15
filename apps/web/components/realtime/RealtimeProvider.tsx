'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  REALTIME_CLIENT_EVENTS,
  REALTIME_EVENTS,
  type ApplicationNewPayload,
  type DealDetail,
  type DealStatusPayload,
} from '@valueskins/shared';
import { dealKeys } from '@/lib/api/deals';
import { STATUS_LABEL } from '@/lib/dealStatus';
import { apiBaseUrl } from '@/lib/env';
import { useToast } from '@/components/ui/Toast';

/** An event this soon after the viewer's own action on a deal is their own echo: no toast. */
export const OWN_ACTION_MS = 5000;

interface RealtimeApi {
  /** Joins `deal:<id>` now and after every reconnect, until `leaveDeal`. */
  joinDeal: (id: string) => void;
  leaveDeal: (id: string) => void;
  /** Call before a mutation, so the echo of it does not toast as "the other person acted". */
  noteOwnAction: (dealId: string) => void;
  /** Deals published since the feed was last loaded. */
  newDeals: number;
  clearNewDeals: () => void;
}

const RealtimeContext = createContext<RealtimeApi | null>(null);

/**
 * Live updates (SPEC 10). The socket only says that something changed; every
 * event refetches over REST. Rooms do not survive a reconnect, so they are
 * joined again, and everything about deals is re-read.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const toast = useToast();
  const socketRef = useRef<Socket | null>(null);
  const rooms = useRef(new Set<string>());
  const ownActions = useRef(new Map<string, number>());
  const [newDeals, setNewDeals] = useState(0);

  useEffect(() => {
    const base = apiBaseUrl();
    const options = { path: '/socket.io', withCredentials: true };
    const socket = base ? io(base, options) : io(options);
    socketRef.current = socket;
    let connectedBefore = false;

    socket.on('connect', () => {
      for (const id of rooms.current)
        socket.emit(REALTIME_CLIENT_EVENTS.DEAL_JOIN, { dealId: id }, () => {});
      if (connectedBefore) {
        // Anything may have happened while we were away.
        void client.invalidateQueries({ queryKey: dealKeys.all });
        void client.invalidateQueries({ queryKey: ['deals'] });
        void client.invalidateQueries({ queryKey: dealKeys.myApplications });
      }
      connectedBefore = true;
    });

    socket.on(REALTIME_EVENTS.DEAL_NEW, () => setNewDeals((n) => n + 1));

    socket.on(REALTIME_EVENTS.DEAL_CLOSED, () => {
      void client.invalidateQueries({ queryKey: dealKeys.feed });
      void client.invalidateQueries({ queryKey: dealKeys.myApplications });
      void client.invalidateQueries({ queryKey: dealKeys.mineAll });
    });

    socket.on(REALTIME_EVENTS.DEAL_UPDATED, (payload: DealStatusPayload) => {
      const before = client.getQueryData<DealDetail>(dealKeys.deal(payload.id));
      void client.invalidateQueries({ queryKey: dealKeys.deal(payload.id) });
      void client.invalidateQueries({ queryKey: dealKeys.mineAll });
      const own = ownActions.current.get(payload.id);
      if (own && Date.now() - own < OWN_ACTION_MS) return;
      if (!before) return;
      const label = STATUS_LABEL[payload.status];
      toast.show(
        before.status !== payload.status
          ? { tone: 'info', title: `The deal moved to ${label}` }
          : {
              tone: 'info',
              title: 'The deal was updated',
              text: 'We reloaded it so you see the latest.',
            },
      );
    });

    socket.on(REALTIME_EVENTS.APPLICATION_NEW, (payload: ApplicationNewPayload) => {
      void client.invalidateQueries({ queryKey: dealKeys.deal(payload.dealId) });
      void client.invalidateQueries({ queryKey: dealKeys.mineAll });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [client, toast]);

  const joinDeal = useCallback((id: string) => {
    rooms.current.add(id);
    const socket = socketRef.current;
    if (socket?.connected) socket.emit(REALTIME_CLIENT_EVENTS.DEAL_JOIN, { dealId: id }, () => {});
  }, []);

  const leaveDeal = useCallback((id: string) => {
    rooms.current.delete(id);
    const socket = socketRef.current;
    if (socket?.connected) socket.emit(REALTIME_CLIENT_EVENTS.DEAL_LEAVE, { dealId: id }, () => {});
  }, []);

  const noteOwnAction = useCallback((dealId: string) => {
    ownActions.current.set(dealId, Date.now());
  }, []);

  const clearNewDeals = useCallback(() => setNewDeals(0), []);

  const value = useMemo(
    () => ({ joinDeal, leaveDeal, noteOwnAction, newDeals, clearNewDeals }),
    [joinDeal, leaveDeal, noteOwnAction, newDeals, clearNewDeals],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

const NOOP: RealtimeApi = {
  joinDeal: () => {},
  leaveDeal: () => {},
  noteOwnAction: () => {},
  newDeals: 0,
  clearNewDeals: () => {},
};

/** The live-update controls. Outside the provider (tests, public pages) they do nothing. */
export function useRealtime(): RealtimeApi {
  return useContext(RealtimeContext) ?? NOOP;
}

/** Keeps this deal's room joined while the page is open. */
export function useDealRoom(dealId: string, enabled: boolean) {
  const { joinDeal, leaveDeal } = useRealtime();
  useEffect(() => {
    if (!enabled) return;
    joinDeal(dealId);
    return () => leaveDeal(dealId);
  }, [dealId, enabled, joinDeal, leaveDeal]);
}
