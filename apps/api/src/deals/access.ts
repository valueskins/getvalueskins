import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/types.js';
import { db } from '../db/client.js';
import { deals } from '../db/schema/index.js';
import { AppError } from '../errors/AppError.js';
import type { Deal } from './stateMachine.js';

const uuidSchema = z.string().uuid();

export function notFound(): AppError {
  return new AppError('NOT_FOUND', 404, 'Not found');
}

/** A route id that is not a UUID cannot exist: 404, not a database error. */
export function parseId(raw: unknown): string {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

/** SPEC 16: OPEN deals to any signed-in user; otherwise only the brand, the confirmed creator, or an admin. */
export function canViewDeal(deal: Deal, viewer: AuthenticatedUser): boolean {
  return (
    viewer.isAdmin ||
    deal.brandId === viewer.id ||
    deal.creatorId === viewer.id ||
    deal.status === 'OPEN'
  );
}

export async function findDeal(id: string): Promise<Deal | null> {
  const [deal] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  return deal ?? null;
}

/** The deal if the viewer may see it, else a 404 that does not reveal whether it exists. */
export async function loadViewableDeal(rawId: unknown, viewer: AuthenticatedUser): Promise<Deal> {
  const deal = await findDeal(parseId(rawId));
  if (!deal || !canViewDeal(deal, viewer)) throw notFound();
  return deal;
}

/** The deal if `brandId` is its brand, else a 404. */
export async function loadOwnedDeal(rawId: unknown, brandId: string): Promise<Deal> {
  const deal = await findDeal(parseId(rawId));
  if (!deal || deal.brandId !== brandId) throw notFound();
  return deal;
}

/**
 * The deal if the viewer is its brand, its confirmed creator, or an admin; else a 404.
 * Stricter than canViewDeal: an OPEN deal is not a participant's deal (documents, history).
 */
export async function loadParticipantDeal(
  rawId: unknown,
  viewer: AuthenticatedUser,
): Promise<Deal> {
  const deal = await findDeal(parseId(rawId));
  if (!deal) throw notFound();
  const participant =
    viewer.isAdmin ||
    deal.brandId === viewer.id ||
    (deal.creatorId !== null && deal.creatorId === viewer.id);
  if (!participant) throw notFound();
  return deal;
}

/**
 * The deal if `creatorId` is its confirmed creator, else a 404 that does not reveal it exists.
 * The brand, other creators and admins are all "else": only the confirmed creator may confirm.
 */
export async function loadConfirmedCreatorDeal(rawId: unknown, creatorId: string): Promise<Deal> {
  const deal = await findDeal(parseId(rawId));
  if (!deal || deal.creatorId === null || deal.creatorId !== creatorId) throw notFound();
  return deal;
}
