import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client.js';
import { sessions } from '../../src/db/schema/index.js';
import { getRealtime } from '../../src/realtime/emitter.js';
import { closeDb, resetDb, truncateAll } from '../db/testDb.js';
import { adminUser } from '../admin/helpers.js';
import { createUserWithSession, emailUser, instagramUser } from '../helpers/auth.js';
import { brandWithBilling, creatorWithPayout } from '../helpers/deals.js';
import { startHarness, type Harness } from './helpers.js';

let h: Harness;

beforeAll(async () => {
  await resetDb();
});
beforeEach(async () => {
  await truncateAll();
  h = await startHarness();
});
afterEach(async () => {
  await h.stop();
});
afterAll(closeDb);

async function roomsOf(socketId: string): Promise<string[]> {
  const sockets = await h.realtime.io.fetchSockets();
  const socket = sockets.find((s) => s.id === socketId);
  return socket ? [...socket.rooms].filter((room) => room !== socketId).sort() : [];
}

describe('the handshake refuses what is not signed in', () => {
  it('refuses a connection with no cookie', async () => {
    const { client, error } = await h.attempt();
    expect(client).toBeUndefined();
    expect(error?.message).toBe('unauthorized');
  });

  it('refuses a cookie that is not a session, and one that is malformed', async () => {
    const wrong = await h.attempt({ cookie: `${h.env.SESSION_COOKIE_NAME}=not-a-real-token` });
    expect(wrong.error?.message).toBe('unauthorized');

    const malformed = await h.attempt({ cookie: `${h.env.SESSION_COOKIE_NAME}=%E0%A4%A` });
    expect(malformed.error?.message).toBe('unauthorized');

    const otherCookie = await h.attempt({ cookie: 'something_else=1' });
    expect(otherCookie.error?.message).toBe('unauthorized');
  });

  it('refuses an expired session and a deleted one', async () => {
    const expired = await createUserWithSession();
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, expired.user.id));
    expect((await h.attempt({ cookie: expired.cookie })).error?.message).toBe('unauthorized');

    const deleted = await createUserWithSession();
    await db.delete(sessions).where(eq(sessions.userId, deleted.user.id));
    expect((await h.attempt({ cookie: deleted.cookie })).error?.message).toBe('unauthorized');
  });

  it('keeps working for a good session after refusing bad ones', async () => {
    await h.attempt();
    const { cookie } = await createUserWithSession();
    const client = await h.open({ cookie });
    expect(client.socket.connected).toBe(true);
  });

  it('refuses the long-polling transport the same way', async () => {
    const result = await h.attempt({ transports: ['polling'] });
    expect(result.error?.message).toBe('unauthorized');
  });
});

describe('the Origin check', () => {
  it('refuses a handshake from another site, even with a valid session', async () => {
    const { cookie } = await createUserWithSession();
    const result = await h.attempt({ cookie, origin: 'https://evil.example' });
    expect(result.client).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it('accepts the web origin, and a client that sends no Origin (not a browser)', async () => {
    const { cookie } = await createUserWithSession();
    const fromWeb = await h.open({ cookie, origin: h.env.WEB_ORIGIN });
    expect(fromWeb.socket.connected).toBe(true);
    const noOrigin = await h.open({ cookie });
    expect(noOrigin.socket.connected).toBe(true);
  });

  it('refuses the polling transport from another site too', async () => {
    const { cookie } = await createUserWithSession();
    const result = await h.attempt({
      cookie,
      origin: 'https://evil.example',
      transports: ['polling'],
    });
    expect(result.client).toBeUndefined();
  });
});

describe('rooms joined on connect', () => {
  it('puts every socket in its own user room and nobody else', async () => {
    const a = await brandWithBilling();
    const b = await brandWithBilling();
    const clientA = await h.open({ cookie: a.cookie });
    const clientB = await h.open({ cookie: b.cookie });

    expect(await roomsOf(clientA.id)).toEqual([`user:${a.user.id}`]);
    expect(await roomsOf(clientB.id)).toEqual([`user:${b.user.id}`]);
  });

  it('puts an onboarded creator in the creators feed', async () => {
    const creator = await creatorWithPayout();
    const client = await h.open({ cookie: creator.cookie });
    expect(await roomsOf(client.id)).toEqual(['feed:creators', `user:${creator.user.id}`]);
  });

  it('keeps a brand, an admin, an unfinished creator and a role-less account out of the feed', async () => {
    const brand = await brandWithBilling();
    const admin = await adminUser();
    const unfinished = await instagramUser({ role: 'CREATOR', onboardingCompletedAt: null });
    const roleless = await emailUser();

    for (const who of [brand, admin, unfinished, roleless]) {
      const client = await h.open({ cookie: who.cookie });
      expect(await roomsOf(client.id)).toEqual([`user:${who.user.id}`]);
    }
  });

  it('puts no one in a deal room on connect, and ignores a room named by the client', async () => {
    const brand = await brandWithBilling();
    const client = await h.open({ cookie: brand.cookie });
    client.socket.emit('join', 'feed:creators');
    client.socket.emit('join', `user:${brand.user.id}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await roomsOf(client.id)).toEqual([`user:${brand.user.id}`]);
  });
});

describe('shutdown', () => {
  it('close() disconnects every client and puts the no-op emitter back', async () => {
    const { cookie } = await createUserWithSession();
    const client = await h.open({ cookie });
    const disconnected = new Promise((resolve) => client.socket.once('disconnect', resolve));

    await h.realtime.close();
    await disconnected;

    expect(client.socket.connected).toBe(false);
    expect(() => getRealtime().emit('user:x', 'deal:updated', {})).not.toThrow();
  });
});
