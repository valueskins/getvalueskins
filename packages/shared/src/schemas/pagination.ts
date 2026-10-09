import { z } from 'zod';

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

/** `?cursor=&limit=` on every list endpoint (SPEC 16). The cursor is opaque to clients. */
export const cursorPageQuerySchema = z
  .object({
    cursor: z.string().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;
