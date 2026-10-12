import type { Server as HttpServer, IncomingMessage } from 'node:http';
import {
  FEED_ROOM,
  MAX_DEAL_JOINS_PER_MINUTE,
  MAX_DEAL_ROOMS_PER_SOCKET,
  REALTIME_CLIENT_EVENTS,
  dealRoom,
  dealRoomRequestSchema,
  userRoom,
  type DealRoomAck,
} from '@valueskins/shared';
import { Server, type Socket } from 'socket.io';
import { getCookie } from '../auth/cookies.js';
import { findValidSession } from '../auth/session.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ApiContext } from '../context.js';
import { loadParticipantDeal } from '../deals/access.js';
import { logger } from '../logging/logger.js';
import { setRealtime } from './emitter.js';

export interface RealtimeServer {
  io: Server;
  /** Disconnects every client and closes the HTTP server. Also puts the no-op emitter back. */
  close(): Promise<void>;
}

/** Data kept on a socket after the handshake. The cookie token is kept only to re-check the session. */
interface SocketData {
  user: AuthenticatedUser;
  sessionToken: string;
  dealRooms: Set<string>;
  joinTimes: number[];
}

type DealSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

const JOIN_WINDOW_MS = 60 * 1000;
/** Far more than a room request needs; Socket.io's default is 1 MB. */
const MAX_MESSAGE_BYTES = 10_000;

/**
 * Socket.io on the API's HTTP server (SPEC 10). Everything here does its own checking, because
 * Socket.io answers `/socket.io/*` before Express and so skips the Origin check, the session
 * middleware and the rate limiters:
 *
 * - the handshake is refused when an `Origin` header is present and is not `WEB_ORIGIN`, and when
 *   the session cookie is missing, malformed or no longer valid;
 * - a socket joins `user:<id>` always, and `feed:creators` only if it is a creator who finished
 *   onboarding (the rule of `GET /api/deals/feed`);
 * - `deal:<id>` is joined on request, only by the deal's brand, its confirmed creator or an
 *   admin, with the session checked again, and an answer that never says why a join failed.
 *
 * Handshake headers and cookies are never logged.
 */
export function attachRealtime(httpServer: HttpServer, ctx: ApiContext): RealtimeServer {
  const { env } = ctx;

  const io = new Server<
    Record<string, never>,
    Record<string, never>,
    Record<string, never>,
    SocketData
  >(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    allowRequest: (req: IncomingMessage, callback) => {
      const origin = req.headers.origin;
      // Browsers always send Origin on a handshake. A non-browser client sends none and still
      // needs a valid session below.
      if (origin !== undefined && origin !== env.WEB_ORIGIN) {
        logger.info({ reason: 'origin' }, 'socket refused');
        callback('origin not allowed', false);
        return;
      }
      callback(null, true);
    },
  });

  io.use(async (socket, next) => {
    let token: string | undefined;
    try {
      token = getCookie(socket.request, env.SESSION_COOKIE_NAME);
    } catch {
      token = undefined; // a malformed cookie
    }
    if (!token) {
      logger.info({ reason: 'no_cookie' }, 'socket refused');
      next(new Error('unauthorized'));
      return;
    }
    const resolved = await findValidSession(token);
    if (!resolved) {
      logger.info({ reason: 'invalid_session' }, 'socket refused');
      next(new Error('unauthorized'));
      return;
    }
    socket.data = {
      user: resolved.user,
      sessionToken: token,
      dealRooms: new Set(),
      joinTimes: [],
    };
    next();
  });

  io.on('connection', (socket: DealSocket) => {
    const { user } = socket.data;
    void socket.join(userRoom(user.id));
    if (user.role === 'CREATOR' && user.onboardingCompletedAt) void socket.join(FEED_ROOM);
    logger.info(
      { socketId: socket.id, userId: user.id, transport: socket.conn.transport.name },
      'socket connected',
    );

    socket.on(REALTIME_CLIENT_EVENTS.DEAL_JOIN, (payload: unknown, ack?: unknown) => {
      void handleJoin(socket, payload, ctx.now).then((outcome) => {
        reply(ack, { ok: outcome === 'joined' });
        // The answer goes first, then the namespace closes: a logged-out session has no business here.
        if (outcome === 'logged_out') socket.disconnect(false);
      });
    });

    socket.on(REALTIME_CLIENT_EVENTS.DEAL_LEAVE, (payload: unknown, ack?: unknown) => {
      const parsed = dealRoomRequestSchema.safeParse(payload);
      if (parsed.success) {
        void socket.leave(dealRoom(parsed.data.dealId));
        socket.data.dealRooms.delete(parsed.data.dealId);
      }
      reply(ack, { ok: parsed.success });
    });
  });

  setRealtime({
    emit: (room, event, payload) => {
      io.to(room).emit(event, payload);
    },
  });

  return {
    io,
    async close() {
      setRealtime(null);
      await io.close();
    },
  };
}

/** Answers through the acknowledgement callback, if the client gave one. */
function reply(ack: unknown, answer: DealRoomAck): void {
  if (typeof ack === 'function') ack(answer);
}

/**
 * `deal:join`: joins only if the payload is valid, the limits hold, the session is still valid, and
 * the user is the deal's brand, its confirmed creator or an admin. A refusal never says why.
 */
async function handleJoin(
  socket: DealSocket,
  payload: unknown,
  clock: () => Date,
): Promise<'joined' | 'refused' | 'logged_out'> {
  try {
    const parsed = dealRoomRequestSchema.safeParse(payload);
    if (!parsed.success) return 'refused';
    const { dealId } = parsed.data;
    const data = socket.data;

    const now = clock().getTime();
    data.joinTimes = data.joinTimes.filter((at) => now - at < JOIN_WINDOW_MS);
    if (data.joinTimes.length >= MAX_DEAL_JOINS_PER_MINUTE) return 'refused';
    data.joinTimes.push(now);

    if (!data.dealRooms.has(dealId) && data.dealRooms.size >= MAX_DEAL_ROOMS_PER_SOCKET) {
      return 'refused';
    }

    // The cookie may have been logged out or expired since the handshake.
    const resolved = await findValidSession(data.sessionToken);
    if (!resolved) return 'logged_out';
    data.user = resolved.user;

    await loadParticipantDeal(dealId, resolved.user);
    await socket.join(dealRoom(dealId));
    data.dealRooms.add(dealId);
    return 'joined';
  } catch {
    // Not a participant, no such deal, or a database error: all look the same to the client.
    return 'refused';
  }
}
