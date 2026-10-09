import { rupeesToPaise, type DealCreateInput, type DealUpdateInput } from '@valueskins/shared';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { isUniqueViolation } from '../db/pgErrors.js';
import { deals } from '../db/schema/index.js';
import { AppError } from '../errors/AppError.js';
import { findDeal, loadOwnedDeal, notFound, parseId } from './access.js';
import { generateShortId } from './shortId.js';
import type { Deal } from './stateMachine.js';

const MAX_SHORT_ID_ATTEMPTS = 5;

type DraftColumns = Partial<
  Pick<
    typeof deals.$inferInsert,
    | 'title'
    | 'description'
    | 'budgetPaise'
    | 'applicationDeadline'
    | 'contentUploadDeadline'
    | 'dealDeadline'
  >
>;

/** Only the keys the client sent; `null` clears a column. A draft keeps its budget in paise (SPEC 15). */
function toColumns(input: DealCreateInput | DealUpdateInput): DraftColumns {
  const columns: DraftColumns = {};
  if (input.title !== undefined) columns.title = input.title;
  if (input.description !== undefined) columns.description = input.description;
  if (input.budgetRupees !== undefined) {
    columns.budgetPaise = input.budgetRupees === null ? null : rupeesToPaise(input.budgetRupees);
  }
  if (input.applicationDeadline !== undefined) {
    columns.applicationDeadline = input.applicationDeadline;
  }
  if (input.contentUploadDeadline !== undefined) {
    columns.contentUploadDeadline = input.contentUploadDeadline;
  }
  if (input.dealDeadline !== undefined) columns.dealDeadline = input.dealDeadline;
  return columns;
}

function notDraft(): AppError {
  return new AppError('DEAL_NOT_DRAFT', 409, 'Only a draft can be edited or deleted');
}

/** Creating a draft is not a status transition: the row starts in DRAFT. */
export async function createDraft(brandId: string, input: DealCreateInput): Promise<Deal> {
  const columns = toColumns(input);
  for (let attempt = 0; attempt < MAX_SHORT_ID_ATTEMPTS; attempt++) {
    try {
      const [row] = await db
        .insert(deals)
        .values({ ...columns, brandId, shortId: generateShortId(), status: 'DRAFT' })
        .returning();
      if (row) return row;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error('could not generate a unique deal short id');
}

export async function updateDraft(
  brandId: string,
  rawId: unknown,
  input: DealUpdateInput,
): Promise<Deal> {
  const { id, status } = await loadOwnedDeal(rawId, brandId);
  if (status !== 'DRAFT') throw notDraft();

  const columns = toColumns(input);
  if (Object.keys(columns).length === 0) {
    const current = await findDeal(id);
    if (!current) throw notFound();
    return current;
  }

  const [row] = await db
    .update(deals)
    .set(columns)
    .where(and(eq(deals.id, id), eq(deals.brandId, brandId), eq(deals.status, 'DRAFT')))
    .returning();
  if (row) return row;

  // Published or deleted between the read and the write.
  throw (await findDeal(id)) ? notDraft() : notFound();
}

export async function deleteDraft(brandId: string, rawId: unknown): Promise<void> {
  const id = parseId(rawId);
  const [row] = await db
    .delete(deals)
    .where(and(eq(deals.id, id), eq(deals.brandId, brandId), eq(deals.status, 'DRAFT')))
    .returning({ id: deals.id });
  if (row) return;

  const existing = await findDeal(id);
  if (!existing || existing.brandId !== brandId) throw notFound();
  throw notDraft();
}
