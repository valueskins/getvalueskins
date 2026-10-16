import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/client.js';
import { closeDb, resetDb } from './testDb.js';

/**
 * The indexes the hot reads rely on (SPEC 15), found with EXPLAIN on a 50,000-deal database
 * (apps/api/scripts/explain-queries.ts). A schema edit that loses one fails here, and the two
 * queries that had no usable index before migration 0011 are shown to use it now.
 */

beforeAll(resetDb);
afterAll(closeDb);

async function indexNames(table: string): Promise<string[]> {
  const { rows } = await pool.query<{ indexname: string }>(
    'select indexname from pg_indexes where schemaname = $1 and tablename = $2',
    ['public', table],
  );
  return rows.map((r) => r.indexname);
}

/** The plan with sequential scans switched off, so the answer does not depend on how few rows a test table has. */
async function planOf(sql: string, values: unknown[] = []): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local enable_seqscan = off');
    const { rows } = await client.query<{ 'QUERY PLAN': string }>(`explain ${sql}`, values);
    return rows.map((r) => r['QUERY PLAN']).join('\n');
  } finally {
    await client.query('rollback');
    client.release();
  }
}

describe('indexes on deals', () => {
  it('has the composite and partial indexes, and no longer the single-column ones they replace', async () => {
    const names = await indexNames('deals');
    expect(names).toEqual(
      expect.arrayContaining([
        'deals_brand_id_id_idx',
        'deals_creator_id_id_idx',
        'deals_status_id_idx',
        'deals_open_feed_idx',
        'deals_short_id_prefix_idx',
        'deals_application_deadline_idx',
        'deals_content_upload_deadline_idx',
        'deals_deal_deadline_idx',
        'deals_short_id_unique',
      ]),
    );
    expect(names).not.toContain('deals_brand_id_idx');
    expect(names).not.toContain('deals_creator_id_idx');
    expect(names).not.toContain('deals_status_idx');
  });

  it('the creators feed reads the partial index of open deals, newest published first', async () => {
    const plan = await planOf(
      `select id from deals where status = 'OPEN' and application_deadline >= current_date
       order by published_at desc, id desc limit 21`,
    );
    expect(plan).toContain('deals_open_feed_idx');
  });

  it('the admin search by short id prefix uses an index, not a table scan', async () => {
    const plan = await planOf(
      `select id from deals where short_id like $1 order by id desc limit 21`,
      ['AB1%'],
    );
    expect(plan).toContain('deals_short_id_prefix_idx');
  });

  it('my deals (brand, creator) and the admin status filter read one index in id order', async () => {
    const owner = '0197c0a0-0000-7000-8000-000000000000';
    expect(
      await planOf('select id from deals where brand_id = $1 order by id desc limit 21', [owner]),
    ).toContain('deals_brand_id_id_idx');
    expect(
      await planOf('select id from deals where creator_id = $1 order by id desc limit 21', [owner]),
    ).toContain('deals_creator_id_id_idx');
    expect(
      await planOf(`select id from deals where status = 'COMPLETED' order by id desc limit 21`),
    ).toContain('deals_status_id_idx');
  });
});

describe('every foreign key is indexed (CLAUDE.md section 8)', () => {
  it('has an index that starts with the column, for every foreign key in the schema', async () => {
    const { rows } = await pool.query<{ tbl: string; col: string; covered: boolean }>(`
      select c.conrelid::regclass::text as tbl, a.attname as col,
             exists (
               select 1 from pg_index i
               where i.indrelid = c.conrelid and i.indkey[0] = a.attnum
             ) as covered
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and array_length(c.conkey, 1) = 1
    `);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => !r.covered).map((r) => `${r.tbl}.${r.col}`)).toEqual([]);
  });
});
