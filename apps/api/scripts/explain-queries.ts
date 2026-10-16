/**
 * Runs the hot read paths against the scratch database from `explain-seed.ts` and prints
 * EXPLAIN (ANALYZE, BUFFERS) for every statement each one issues: the creators feed, the deal
 * page, the virtual resume, my deals (brand and creator), applicants, the admin deal list and the
 * admin dispute list. The statements are the real ones: it records what the services send to
 * Postgres instead of rewriting them here.
 *
 *   DATABASE_URL=postgres://.../valueskins_explain pnpm tsx scripts/explain-queries.ts [--plans]
 */
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const dbName = new URL(url).pathname.replace(/^\//, '');
if (!dbName.endsWith('_explain')) {
  throw new Error(`Refusing to run on "${dbName}": the database name must end in _explain.`);
}
const showPlans = process.argv.includes('--plans');

const { pool } = await import('../src/db/client.js');

interface Captured {
  text: string;
  values: unknown[];
}
let capture: Captured[] | null = null;
const realQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
(pool as unknown as { query: unknown }).query = (...args: unknown[]) => {
  if (capture) {
    const first = args[0];
    if (typeof first === 'string')
      capture.push({ text: first, values: (args[1] as unknown[]) ?? [] });
    else if (first && typeof first === 'object') {
      const config = first as { text?: string; values?: unknown[] };
      if (config.text) {
        capture.push({ text: config.text, values: config.values ?? (args[1] as unknown[]) ?? [] });
      }
    }
  }
  return realQuery(...args);
};

const { listFeed, listMine } = await import('../src/deals/queries.service.js');
const { buildDealDetail } = await import('../src/deals/dealDetail.js');
const { findDeal } = await import('../src/deals/access.js');
const { loadResume } = await import('../src/users/resume.service.js');
const { listAdminDeals } = await import('../src/admin/adminDeals.service.js');
const { listDisputes } = await import('../src/disputes/disputes.service.js');
const { listDealApplications, listMyApplications } =
  await import('../src/applications/applications.service.js');

const now = new Date();
const ctx = { env: {} as never, now: () => now };

async function userRow(sql: string) {
  const { rows } = await pool.query(sql);
  const r = rows[0];
  if (!r) throw new Error(`no row for ${sql}`);
  return {
    id: r.id as string,
    instagramUserId: r.instagram_user_id as string,
    username: r.username as string,
    role: r.role as 'BRAND' | 'CREATOR',
    isAdmin: false,
    onboardingCompletedAt: new Date(),
    email: r.email as string,
    emailVerifiedAt: new Date(),
  };
}

// The busiest brand, and a creator with many confirmed deals.
const brand = await userRow(
  `SELECT u.* FROM users u JOIN (SELECT brand_id FROM deals GROUP BY 1 ORDER BY count(*) DESC LIMIT 1) t ON t.brand_id = u.id`,
);
const creator = await userRow(
  `SELECT u.* FROM users u JOIN (SELECT creator_id FROM deals WHERE creator_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1) t ON t.creator_id = u.id`,
);
// A brand and a creator with few deals: the walk down the whole table that a missing composite index causes shows here.
const rareBrand = await userRow(
  `SELECT u.* FROM users u JOIN (SELECT brand_id FROM deals GROUP BY 1 ORDER BY count(*), brand_id LIMIT 1) t ON t.brand_id = u.id`,
);
const rareCreator = await userRow(
  `SELECT u.* FROM users u JOIN (SELECT creator_id FROM deals WHERE creator_id IS NOT NULL GROUP BY 1 ORDER BY count(*), creator_id LIMIT 1) t ON t.creator_id = u.id`,
);
const { rows: openDeal } = await pool.query(
  `SELECT id FROM deals WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1`,
);
const { rows: doneDeal } = await pool.query(
  `SELECT id FROM deals WHERE status = 'COMPLETED' AND brand_id = $1 ORDER BY id DESC LIMIT 1`,
  [brand.id],
);
const { rows: counts } = await pool.query(
  `SELECT (SELECT count(*) FROM deals) deals, (SELECT count(*) FROM deals WHERE brand_id = $1) brand_deals`,
  [brand.id],
);
console.log(
  `database ${dbName}: ${counts[0].deals} deals, busiest brand has ${counts[0].brand_deals}\n`,
);

const scenarios: Array<{ name: string; run: () => Promise<unknown> }> = [];
const add = (name: string, run: () => Promise<unknown>) => scenarios.push({ name, run });

let feedCursor: string | null = null;
add('feed, first page', async () => {
  const page = await listFeed(ctx, creator, { limit: 20 } as never);
  feedCursor = page.nextCursor;
});
add('feed, next page (cursor)', () =>
  listFeed(ctx, creator, { limit: 20, cursor: feedCursor ?? undefined } as never),
);
add('deal page, open deal, as a creator', async () => {
  const deal = await findDeal(openDeal[0].id);
  return buildDealDetail(deal!, creator, now, ctx.env);
});
add('deal page, completed deal, as its brand', async () => {
  const deal = await findDeal(doneDeal[0].id);
  return buildDealDetail(deal!, brand, now, ctx.env);
});
add('resume, busiest brand', () => loadResume(brand.id, now));
add('resume, busy creator', () => loadResume(creator.id, now));
add('my deals, brand, all', () => listMine(ctx, brand, { limit: 20 } as never));
add('my deals, brand, status filter', () =>
  listMine(ctx, brand, { limit: 20, status: ['OPEN', 'CONFIRMED', 'COMMISSION_PAID'] } as never),
);
add('my deals, creator', () => listMine(ctx, creator, { limit: 20 } as never));
add('my deals, brand with few deals', () => listMine(ctx, rareBrand, { limit: 20 } as never));
add('my deals, creator with few deals', () => listMine(ctx, rareCreator, { limit: 20 } as never));
add('applicants of an open deal', () =>
  listDealApplications({ ...brand, id: (openOwner as { id: string }).id }, openDeal[0].id, {
    limit: 20,
  } as never),
);
add('my applications, creator', () => listMyApplications(creator, { limit: 20 } as never));
let adminCursor: string | null = null;
add('admin deals, first page', async () => {
  const page = await listAdminDeals(ctx, { limit: 20 } as never);
  adminCursor = page.nextCursor;
});
add('admin deals, next page', () =>
  listAdminDeals(ctx, { limit: 20, cursor: adminCursor ?? undefined } as never),
);
add('admin deals, status OPEN', () => listAdminDeals(ctx, { limit: 20, status: 'OPEN' } as never));
add('admin deals, status COMPLETED', () =>
  listAdminDeals(ctx, { limit: 20, status: 'COMPLETED' } as never),
);
add('admin deals, short id prefix', () => listAdminDeals(ctx, { limit: 20, q: 'AB1' } as never));
add('admin disputes, open', () => listDisputes({ limit: 20, status: 'OPEN' } as never));
add('admin disputes, all', () => listDisputes({ limit: 20 } as never));

const { rows: owner } = await pool.query(`SELECT brand_id FROM deals WHERE id = $1`, [
  openDeal[0].id,
]);
const openOwner = { id: owner[0].brand_id as string };

const BIG = new Set([
  'deals',
  'applications',
  'direct_payments',
  'deal_events',
  'email_log',
  'users',
  'disputes',
]);
let flagged = 0;

for (const scenario of scenarios) {
  capture = [];
  await scenario.run();
  const statements = capture;
  capture = null;
  let total = 0;
  const lines: string[] = [];
  for (const [index, st] of statements.entries()) {
    if (/^\s*(begin|commit|rollback|set |show )/i.test(st.text)) continue;
    const { rows } = (await realQuery(`EXPLAIN (ANALYZE, BUFFERS) ${st.text}`, st.values)) as {
      rows: Array<{ 'QUERY PLAN': string }>;
    };
    const plan = rows.map((r) => r['QUERY PLAN']);
    const ms = Number(/Execution Time: ([\d.]+) ms/.exec(plan.join('\n'))?.[1] ?? 0);
    total += ms;
    const seq = [...plan.join('\n').matchAll(/Seq Scan on (\w+)/g)]
      .map((m) => m[1]!)
      .filter((t) => BIG.has(t));
    const indexes = [
      ...new Set(
        [...plan.join('\n').matchAll(/Index (?:Only )?Scan(?: Backward)? using (\w+)/g)].map(
          (m) => m[1]!,
        ),
      ),
    ];
    const bitmaps = [
      ...new Set([...plan.join('\n').matchAll(/Bitmap Index Scan on (\w+)/g)].map((m) => m[1]!)),
    ];
    if (seq.length > 0) flagged += 1;
    const from = /\bfrom "(\w+)"/i.exec(st.text)?.[1] ?? '?';
    lines.push(
      `  ${String(index + 1).padStart(2)}. ${from.padEnd(16)} ${ms.toFixed(2).padStart(8)} ms  ${
        seq.length > 0 ? `SEQ SCAN ${[...new Set(seq)].join(',')}  ` : ''
      }${[...indexes, ...bitmaps.map((b) => `bitmap:${b}`)].join(' ')}`,
    );
    if (showPlans || seq.length > 0 || ms > 20) lines.push(...plan.map((l) => `        | ${l}`));
  }
  console.log(`${scenario.name}  [${statements.length} statements, ${total.toFixed(1)} ms]`);
  console.log(lines.join('\n'));
  console.log('');
}
console.log(`${flagged} statement(s) scan a large table sequentially.`);
await pool.end();
