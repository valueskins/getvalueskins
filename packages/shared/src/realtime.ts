import { z } from 'zod';
import { DEAL_STATUSES } from './dealStateMachine.js';

/**
 * Real-time events (SPEC 10). A socket only says that something changed: the client refetches the
 * data over REST on every event and on reconnect, so none of these payloads is a source of truth
 * and none carries anything REST would hide (no UPI ID, no email).
 */

/** Server to client. */
export const REALTIME_EVENTS = {
  /** A deal was published. To `feed:creators`. */
  DEAL_NEW: 'deal:new',
  /** A deal left OPEN (confirmed or cancelled), so it disappears from feeds. To `feed:creators`. */
  DEAL_CLOSED: 'deal:closed',
  /** A deal changed: any transition, or a direct payment recorded or marked not received. To `deal:<id>`. */
  DEAL_UPDATED: 'deal:updated',
  /** A creator applied. To `user:<brandId>`. */
  APPLICATION_NEW: 'application:new',
} as const;

/** Client to server. Both are answered through the acknowledgement callback. */
export const REALTIME_CLIENT_EVENTS = {
  DEAL_JOIN: 'deal:join',
  DEAL_LEAVE: 'deal:leave',
} as const;

/** Every creator who finished onboarding. */
export const FEED_ROOM = 'feed:creators';
export const userRoom = (userId: string): string => `user:${userId}`;
/** The deal's brand, its confirmed creator and admins. Joining is checked by the server. */
export const dealRoom = (dealId: string): string => `deal:${dealId}`;

/** The most deal rooms one socket may hold, and the most `deal:join` calls it may make a minute. */
export const MAX_DEAL_ROOMS_PER_SOCKET = 50;
export const MAX_DEAL_JOINS_PER_MINUTE = 30;

const dealStatusSchema = z.enum(DEAL_STATUSES);

export const dealNewPayloadSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    brand: z.object({ username: z.string(), profilePictureUrl: z.string().nullable() }).strict(),
    budgetPaise: z.number().int(),
    creatorAmountPaise: z.number().int(),
    applicationDeadline: z.string(),
    contentUploadDeadline: z.string(),
  })
  .strict();

/** `deal:closed` and `deal:updated`. */
export const dealStatusPayloadSchema = z
  .object({ id: z.string(), status: dealStatusSchema })
  .strict();

export const applicationNewPayloadSchema = z
  .object({ dealId: z.string(), applicationId: z.string() })
  .strict();

/** The body of `deal:join` and `deal:leave`. */
export const dealRoomRequestSchema = z.object({ dealId: z.string().uuid() }).strict();

/** The acknowledgement of `deal:join` and `deal:leave`. It never says why a join was refused. */
export const dealRoomAckSchema = z.object({ ok: z.boolean() }).strict();

export type DealNewPayload = z.infer<typeof dealNewPayloadSchema>;
export type DealStatusPayload = z.infer<typeof dealStatusPayloadSchema>;
export type ApplicationNewPayload = z.infer<typeof applicationNewPayloadSchema>;
export type DealRoomRequest = z.infer<typeof dealRoomRequestSchema>;
export type DealRoomAck = z.infer<typeof dealRoomAckSchema>;
