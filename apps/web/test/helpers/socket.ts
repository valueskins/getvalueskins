import { vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

/** A stand-in for a socket.io client socket: records emits, lets a test fire server events. */
export class FakeSocket {
  connected = false;
  handlers = new Map<string, Handler[]>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  disconnect = vi.fn(() => {
    this.connected = false;
  });

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  removeAllListeners() {
    this.handlers.clear();
    return this;
  }

  emit(event: string, payload?: unknown, ack?: Handler) {
    this.emitted.push({ event, payload });
    ack?.({ ok: true });
    return this;
  }

  /** Fires a server-to-client event (or `connect`). */
  serverEmit(event: string, payload?: unknown) {
    if (event === 'connect') this.connected = true;
    for (const h of this.handlers.get(event) ?? []) h(payload);
  }
}

export const sockets = {
  last: null as FakeSocket | null,
  args: [] as unknown[][],
};

export function resetSockets() {
  sockets.last = null;
  sockets.args = [];
}
