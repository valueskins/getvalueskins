import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { dealKeys } from '@/lib/api/deals';
import { RealtimeProvider, useDealRoom, useRealtime } from '@/components/realtime/RealtimeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { makeDeal, DEAL_ID } from './helpers/deals';
import { sockets } from './helpers/socket';

function setup(children: React.ReactNode = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RealtimeProvider>{children}</RealtimeProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  const socket = sockets.last!;
  const keys = () => invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
  return { client, invalidate, socket, keys, ...view };
}

function Room({ id }: { id: string }) {
  useDealRoom(id, true);
  return null;
}

function NewDeals() {
  const { newDeals } = useRealtime();
  return <p>new: {newDeals}</p>;
}

describe('live updates', () => {
  it('connects to the API origin with the session cookie', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
    setup();
    expect(sockets.args[0]).toEqual([
      'https://api-staging.valueskins.com',
      { path: '/socket.io', withCredentials: true },
    ]);
  });

  it('refetches the deal and the lists on deal:updated, and the brand view on application:new', () => {
    const { socket, keys } = setup();
    act(() => socket.serverEmit('deal:updated', { id: DEAL_ID, status: 'COMMISSION_PAID' }));
    expect(keys()).toEqual(
      expect.arrayContaining([
        JSON.stringify(dealKeys.deal(DEAL_ID)),
        JSON.stringify(dealKeys.mineAll),
      ]),
    );
    act(() => socket.serverEmit('application:new', { dealId: 'd-2', applicationId: 'a-1' }));
    expect(keys()).toContain(JSON.stringify(dealKeys.deal('d-2')));
  });

  it('refetches the feed and applications when a deal closes, and counts new deals', () => {
    const { socket, keys } = setup(<NewDeals />);
    act(() => socket.serverEmit('deal:closed', { id: DEAL_ID, status: 'CONFIRMED' }));
    expect(keys()).toEqual(
      expect.arrayContaining([
        JSON.stringify(dealKeys.feed),
        JSON.stringify(dealKeys.myApplications),
      ]),
    );
    act(() => {
      socket.serverEmit('deal:new', { id: 'n1' });
      socket.serverEmit('deal:new', { id: 'n2' });
    });
    expect(screen.getByText('new: 2')).toBeInTheDocument();
  });

  it('joins and leaves a deal room, and joins again after a reconnect with a full refetch', () => {
    const { socket, keys, unmount } = setup(<Room id={DEAL_ID} />);
    act(() => socket.serverEmit('connect'));
    expect(socket.emitted).toContainEqual({ event: 'deal:join', payload: { dealId: DEAL_ID } });
    const before = keys().length;
    act(() => socket.serverEmit('connect'));
    expect(socket.emitted.filter((e) => e.event === 'deal:join')).toHaveLength(2);
    expect(keys().slice(before)).toEqual(
      expect.arrayContaining([JSON.stringify(dealKeys.all), JSON.stringify(['deals'])]),
    );
    unmount();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('toasts when the other person acts, but not for the viewer’s own action', () => {
    let api: ReturnType<typeof useRealtime> | null = null;
    function Grab() {
      api = useRealtime();
      return null;
    }
    const { socket, client } = setup(<Grab />);
    client.setQueryData(dealKeys.deal(DEAL_ID), makeDeal('CONFIRMED'));
    act(() => socket.serverEmit('deal:updated', { id: DEAL_ID, status: 'COMMISSION_PAID' }));
    expect(screen.getByText('The deal moved to Fee paid')).toBeInTheDocument();

    act(() => api!.noteOwnAction(DEAL_ID));
    act(() => socket.serverEmit('deal:updated', { id: DEAL_ID, status: 'COMMISSION_PAID' }));
    expect(screen.queryByText('The deal was updated')).not.toBeInTheDocument();
  });
});
