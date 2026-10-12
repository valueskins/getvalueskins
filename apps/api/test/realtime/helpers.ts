import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { attachRealtime, type RealtimeServer } from '../../src/realtime/server.js';
import { http as api, NOW } from '../helpers/deals.js';
import { buildTestEnv } from '../testEnv.js';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Time to wait before saying "nothing arrived". Events cross a local socket in a few milliseconds. */
export const QUIET_MS = 250;

export interface Received {
  event: string;
  payload: unknown;
}

/** A connected test client that remembers everything it was sent. */
export class Client {
  readonly received: Received[] = [];

  constructor(readonly socket: ClientSocket) {
    socket.onAny((event: string, payload: unknown) => {
      this.received.push({ event, payload });
    });
  }

  get id(): string {
    return this.socket.id as string;
  }

  /** The payloads of one event, in order. */
  of(event: string): unknown[] {
    return this.received.filter((r) => r.event === event).map((r) => r.payload);
  }

  /** `deal:join` and its answer. */
  async join(dealId: unknown): Promise<unknown> {
    return this.socket.timeout(3000).emitWithAck('deal:join', { dealId });
  }

  async joinRaw(payload: unknown): Promise<unknown> {
    return this.socket.timeout(3000).emitWithAck('deal:join', payload);
  }

  async leave(dealId: unknown): Promise<unknown> {
    return this.socket.timeout(3000).emitWithAck('deal:leave', { dealId });
  }

  close(): void {
    this.socket.close();
  }
}

export type ConnectOptions = { cookie?: string; origin?: string; transports?: string[] };

export interface Harness {
  /** The Express app: REST calls through `call` reach the same emitter the sockets listen to. */
  call: ReturnType<typeof api>;
  app: ReturnType<typeof createApp>;
  url: string;
  realtime: RealtimeServer;
  env: ReturnType<typeof buildTestEnv>;
  /** Connects and resolves with the client, or rejects with the refusal. */
  open(options?: ConnectOptions): Promise<Client>;
  /** Connects and resolves with `{ client }` or `{ error }`: never rejects. */
  attempt(options?: ConnectOptions): Promise<{ client?: Client; error?: Error }>;
  stop(): Promise<void>;
}

/** The real API on a free port with Socket.io attached, like `src/index.ts` does. */
export async function startHarness(
  appOptions: Parameters<typeof createApp>[1] = { now: () => NOW },
): Promise<Harness> {
  const env = buildTestEnv();
  const app = createApp(env, appOptions);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://localhost:${port}`;
  const realtime = attachRealtime(server, { env, now: appOptions?.now ?? (() => new Date()) });
  const clients: Client[] = [];

  const attempt: Harness['attempt'] = (options = {}) =>
    new Promise((resolve) => {
      const headers: Record<string, string> = {};
      if (options.cookie) headers.cookie = options.cookie;
      if (options.origin) headers.origin = options.origin;
      const socket = connectClient(url, {
        forceNew: true,
        reconnection: false,
        transports: options.transports ?? ['websocket'],
        extraHeaders: headers,
      });
      const client = new Client(socket);
      clients.push(client);
      socket.once('connect', () => resolve({ client }));
      socket.once('connect_error', (error) => {
        socket.close();
        resolve({ error });
      });
    });

  return {
    call: api(app),
    app,
    url,
    realtime,
    env,
    attempt,
    async open(options) {
      const result = await attempt(options);
      if (!result.client) throw result.error ?? new Error('could not connect');
      return result.client;
    },
    async stop() {
      for (const client of clients) client.close();
      await realtime.close();
    },
  };
}
