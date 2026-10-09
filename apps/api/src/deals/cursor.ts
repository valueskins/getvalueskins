import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

const cursorSchema = z
  .object({
    /** published_at as an ISO string; only the feed orders by it. */
    p: z.string().datetime().optional(),
    i: z.string().uuid(),
  })
  .strict();

export type PageCursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Cursors are opaque to clients; anything that does not decode is a 400. */
export function decodeCursor(raw: string, options: { needsTime: boolean }): PageCursor {
  const invalid = () => new AppError('INVALID_CURSOR', 400, 'Invalid cursor');
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    if (!parsed.success) throw invalid();
    if (options.needsTime && parsed.data.p === undefined) throw invalid();
    return parsed.data;
  } catch (error) {
    throw error instanceof AppError ? error : invalid();
  }
}
