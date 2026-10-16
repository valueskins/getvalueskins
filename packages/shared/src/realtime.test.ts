import { describe, expect, it } from 'vitest';
import {
  FEED_ROOM,
  REALTIME_EVENTS,
  applicationNewPayloadSchema,
  dealNewPayloadSchema,
  dealRoom,
  dealRoomAckSchema,
  dealRoomRequestSchema,
  dealStatusPayloadSchema,
  userRoom,
} from './realtime.js';

const ID = '01a0e8e8-52b5-75d3-999f-4570bcd490e4';

describe('rooms and event names', () => {
  it('builds the SPEC 10 room names', () => {
    expect(FEED_ROOM).toBe('feed:creators');
    expect(userRoom(ID)).toBe(`user:${ID}`);
    expect(dealRoom(ID)).toBe(`deal:${ID}`);
  });

  it('has the five SPEC 10 events', () => {
    expect(Object.values(REALTIME_EVENTS).sort()).toEqual([
      'application:new',
      'deal:closed',
      'deal:new',
      'deal:summary',
      'deal:updated',
    ]);
  });
});

describe('payload schemas', () => {
  const dealNew = {
    id: ID,
    title: 'Three posts',
    brand: { username: 'brand_one', profilePictureUrl: null },
    budgetPaise: 1_000_000,
    creatorAmountPaise: 911_500,
    applicationDeadline: '2026-10-12',
    contentUploadDeadline: '2026-10-20',
  };

  it('accepts a deal:new payload and rejects extra or missing fields', () => {
    expect(dealNewPayloadSchema.safeParse(dealNew).success).toBe(true);
    expect(dealNewPayloadSchema.safeParse({ ...dealNew, advancePaise: 1 }).success).toBe(false);
    expect(
      dealNewPayloadSchema.safeParse({ ...dealNew, brand: { ...dealNew.brand, email: 'a' } })
        .success,
    ).toBe(false);
    const missing: Partial<typeof dealNew> = { ...dealNew };
    delete missing.title;
    expect(dealNewPayloadSchema.safeParse(missing).success).toBe(false);
  });

  it('accepts deal:closed and deal:updated with a known status only', () => {
    expect(dealStatusPayloadSchema.safeParse({ id: ID, status: 'OPEN' }).success).toBe(true);
    expect(dealStatusPayloadSchema.safeParse({ id: ID, status: 'NOPE' }).success).toBe(false);
    expect(dealStatusPayloadSchema.safeParse({ id: ID, status: 'OPEN', note: 'x' }).success).toBe(
      false,
    );
  });

  it('accepts application:new with ids only', () => {
    expect(applicationNewPayloadSchema.safeParse({ dealId: ID, applicationId: ID }).success).toBe(
      true,
    );
    expect(
      applicationNewPayloadSchema.safeParse({ dealId: ID, applicationId: ID, creator: 'x' })
        .success,
    ).toBe(false);
  });

  it('accepts a join request with a UUID only', () => {
    expect(dealRoomRequestSchema.safeParse({ dealId: ID }).success).toBe(true);
    expect(dealRoomRequestSchema.safeParse({ dealId: 'nope' }).success).toBe(false);
    expect(dealRoomRequestSchema.safeParse({ dealId: ID, extra: 1 }).success).toBe(false);
    expect(dealRoomRequestSchema.safeParse(undefined).success).toBe(false);
    expect(dealRoomRequestSchema.safeParse('deal:x').success).toBe(false);
  });

  it('the acknowledgement is only ok: true or false', () => {
    expect(dealRoomAckSchema.safeParse({ ok: true }).success).toBe(true);
    expect(dealRoomAckSchema.safeParse({ ok: false, reason: 'no such deal' }).success).toBe(false);
  });
});
