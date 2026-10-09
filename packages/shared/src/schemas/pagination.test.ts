import { describe, expect, it } from 'vitest';
import { cursorPageQuerySchema } from './pagination.js';

describe('cursorPageQuerySchema', () => {
  it('defaults the limit to 20', () => {
    expect(cursorPageQuerySchema.parse({})).toEqual({ limit: 20 });
  });
  it('coerces a query-string limit and keeps the cursor', () => {
    expect(cursorPageQuerySchema.parse({ limit: '50', cursor: 'abc' })).toEqual({
      limit: 50,
      cursor: 'abc',
    });
  });
  it.each(['0', '51', '-1', '1.5', 'abc'])('rejects limit %s', (limit) => {
    expect(cursorPageQuerySchema.safeParse({ limit }).success).toBe(false);
  });
  it('rejects unknown keys and an empty cursor', () => {
    expect(cursorPageQuerySchema.safeParse({ page: 2 }).success).toBe(false);
    expect(cursorPageQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});
