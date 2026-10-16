/**
 * Fills a scratch database with a realistic volume (about 50,000 deals) so EXPLAIN shows what the
 * planner does at size. Not part of `db:seed`: it refuses to run unless the database name ends in
 * `_explain` and NODE_ENV is not production, and it never truncates a database it does not own.
 *
 *   createdb valueskins_explain
 *   DATABASE_URL=postgres://.../valueskins_explain pnpm db:migrate
 *   DATABASE_URL=postgres://.../valueskins_explain pnpm tsx scripts/explain-seed.ts
 */
import { existsSync } from 'node:fs';
import { Client } from 'pg';

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const dbName = new URL(url).pathname.replace(/^\//, '');
if (!dbName.endsWith('_explain') || process.env.NODE_ENV === 'production') {
  throw new Error(`Refusing to seed "${dbName}": the database name must end in _explain.`);
}

const DEALS = Number(process.env.EXPLAIN_DEALS ?? 50_000);
const BRANDS = 1_000;
const CREATORS = 5_000;

/** Time-ordered UUIDs, like the app's UUID v7 ids, so the primary key order is the creation order. */
const UUID7 = `
CREATE OR REPLACE FUNCTION uuid7(ts timestamptz, n bigint) RETURNS uuid AS $$
  SELECT (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-' || substr(h, 13, 4) || '-' || substr(h, 17, 4) || '-' || substr(h, 21, 12))::uuid
  FROM (SELECT lpad(to_hex((extract(epoch from ts) * 1000)::bigint), 12, '0') || '7' ||
               substr(lpad(to_hex(n), 18, '0'), 1, 3) || '8' || substr(lpad(to_hex(n), 18, '0'), 4, 15) AS h) x
$$ LANGUAGE sql IMMUTABLE;`;

const client = new Client({ connectionString: url });
await client.connect();
const run = async (label: string, sql: string, values: unknown[] = []) => {
  const started = Date.now();
  const res = await client.query(sql, values);
  console.log(
    `${label.padEnd(24)} ${String(res.rowCount ?? 0).padStart(8)} rows  ${Date.now() - started} ms`,
  );
};

await client.query(
  'TRUNCATE users, deals, applications, direct_payments, disputes, deal_events, email_log, invoices, payments, content_uploads, rate_limiter_points RESTART IDENTITY CASCADE',
);
await client.query(UUID7);

// One year of history, ending now. Index i (1-based) is the creation order.
const T0 = `(now() - interval '400 days')`;
const at = (n: string, per: string) => `(${T0} + (${n}::numeric * ${per}) * interval '1 second')`;

await run(
  'brands',
  `
INSERT INTO users (id, instagram_user_id, username, name, ig_account_type, role, role_locked_at, email, email_verified_at,
                   onboarding_completed_at, followers_count, created_at, updated_at)
SELECT uuid7(${at('i', '1')}, i), 'ig-b-' || i, 'brand_' || i, 'Brand ' || i, 'BUSINESS', 'BRAND', now(),
       'brand' || i || '@example.com', now(), now(), 1000 + i, ${at('i', '1')}, now()
FROM generate_series(1, ${BRANDS}) i`,
);

await run(
  'creators',
  `
INSERT INTO users (id, instagram_user_id, username, name, ig_account_type, role, role_locked_at, email, email_verified_at,
                   onboarding_completed_at, followers_count, payout_vpa, payout_name, payout_vpa_consent_at,
                   city, age, age_recorded_at, created_at, updated_at)
SELECT uuid7(${at('i + 100000', '1')}, i + 100000), 'ig-c-' || i, 'creator_' || i, 'Creator ' || i, 'MEDIA_CREATOR', 'CREATOR', now(),
       'creator' || i || '@example.com', now(), now(), 500 + i, 'seed.creator' || i || '@okaxis', 'Creator ' || i, now(),
       'Pune', 25, now(), ${at('i + 100000', '1')}, now()
FROM generate_series(1, ${CREATORS}) i`,
);

// A few brands are far busier than the rest: every third deal goes to one of 20 brands.
await client.query(
  `CREATE TEMP TABLE brand_ids AS SELECT row_number() OVER (ORDER BY username)::int AS n, id FROM users WHERE role = 'BRAND'`,
);
await client.query(
  `CREATE TEMP TABLE creator_ids AS SELECT row_number() OVER (ORDER BY username)::int AS n, id FROM users WHERE role = 'CREATOR'`,
);
await client.query('CREATE INDEX ON brand_ids (n)');
await client.query('CREATE INDEX ON creator_ids (n)');

await run(
  'deals',
  `
INSERT INTO deals (id, short_id, brand_id, creator_id, title, description, budget_paise, commission_base_paise, commission_gst_paise,
                   commission_total_paise, creator_amount_paise, advance_paise, final_paise, application_deadline,
                   content_upload_deadline, deal_deadline, status, upload_count, revision_count, published_at, confirmed_at,
                   commission_paid_at, advance_paid_at, approved_at, completed_at, cancelled_at, cancelled_by_role,
                   cancellation_reason, created_at, updated_at)
SELECT d.id, upper(substr(md5(d.i::text), 1, 8)), b.id,
       CASE WHEN d.st IN ('DRAFT', 'OPEN') OR (d.st = 'CANCELLED' AND d.i % 2 = 0) THEN NULL ELSE c.id END,
       'Deal ' || d.i, 'Content type: 3 posts. Deal number ' || d.i,
       1000000, 75000, 13500, 88500, 911500, 273450, 638050,
       (d.ts + interval '10 days')::date, (d.ts + interval '20 days')::date, (d.ts + interval '30 days')::date,
       d.st::deal_status, 0, 0,
       CASE WHEN d.st = 'DRAFT' THEN NULL ELSE d.ts END,
       CASE WHEN d.st IN ('DRAFT', 'OPEN') OR (d.st = 'CANCELLED' AND d.i % 2 = 0) THEN NULL ELSE d.ts + interval '1 day' END,
       CASE WHEN d.st IN ('COMMISSION_PAID','ADVANCE_PAID','CONTENT_UPLOADED','REVISION_REQUESTED','APPROVED','COMPLETED') THEN d.ts + interval '2 days' END,
       CASE WHEN d.st IN ('ADVANCE_PAID','CONTENT_UPLOADED','REVISION_REQUESTED','APPROVED','COMPLETED') THEN d.ts + interval '3 days' END,
       CASE WHEN d.st IN ('APPROVED','COMPLETED') THEN d.ts + interval '5 days' END,
       CASE WHEN d.st = 'COMPLETED' THEN d.ts + interval '6 days' END,
       CASE WHEN d.st = 'CANCELLED' THEN d.ts + interval '2 days' END,
       CASE WHEN d.st = 'CANCELLED' THEN 'BRAND'::cancelled_by_role END,
       CASE WHEN d.st = 'CANCELLED' THEN 'Changed plans' END,
       d.ts, d.ts
FROM (
  SELECT i, uuid7(${at('i', '600')}, i) AS id, ${at('i', '600')} AS ts,
         CASE WHEN i % 100 < 55 THEN 'COMPLETED' WHEN i % 100 < 80 THEN 'CANCELLED' WHEN i % 100 < 84 THEN 'OPEN'
              WHEN i % 100 < 87 THEN 'CONFIRMED' WHEN i % 100 < 90 THEN 'COMMISSION_PAID' WHEN i % 100 < 93 THEN 'ADVANCE_PAID'
              WHEN i % 100 < 95 THEN 'CONTENT_UPLOADED' WHEN i % 100 < 96 THEN 'REVISION_REQUESTED'
              WHEN i % 100 < 98 THEN 'APPROVED' ELSE 'DRAFT' END AS st
  FROM generate_series(1::bigint, ${DEALS}) i
) d
JOIN brand_ids b ON b.n = CASE WHEN d.i % 3 = 0 THEN 1 + (d.i % 20) * 50 % ${BRANDS} ELSE 1 + (d.i * 7919) % ${BRANDS} END
JOIN creator_ids c ON c.n = 1 + ((d.i * 104729) % ${CREATORS})`,
);

// The OPEN deals have a deadline in the future so they appear in the feed; brands keep a few drafts.
await run(
  'open deadlines',
  `UPDATE deals SET application_deadline = (now() + interval '7 days')::date,
  content_upload_deadline = (now() + interval '14 days')::date, deal_deadline = (now() + interval '21 days')::date,
  published_at = now() - (random() * interval '5 days') WHERE status = 'OPEN'`,
);

await run(
  'applications (open)',
  `
INSERT INTO applications (id, deal_id, creator_id, status, created_at, updated_at)
SELECT uuid7(d.published_at + k * interval '1 minute', row_number() OVER ()::bigint + 500000000), d.id, c.id, 'APPLIED', d.published_at, d.published_at
FROM deals d CROSS JOIN generate_series(1, 6) k
JOIN creator_ids c ON c.n = 1 + ((hashtext(d.id::text) % ${CREATORS} + ${CREATORS} + k * 37) % ${CREATORS})
WHERE d.status = 'OPEN'
ON CONFLICT DO NOTHING`,
);

await run(
  'applications (closed)',
  `
INSERT INTO applications (id, deal_id, creator_id, status, created_at, updated_at)
SELECT uuid7(d.published_at + interval '10 minutes', row_number() OVER ()::bigint + 600000000), d.id, d.creator_id, 'CONFIRMED'::application_status, d.published_at, d.published_at
FROM deals d WHERE d.creator_id IS NOT NULL
UNION ALL
SELECT uuid7(d.published_at + interval '11 minutes', row_number() OVER ()::bigint + 700000000), d.id, c.id, 'REJECTED'::application_status, d.published_at, d.published_at
FROM deals d JOIN creator_ids c ON c.n = 1 + ((hashtext(d.id::text) % ${CREATORS} + ${CREATORS} + 5) % ${CREATORS})
WHERE d.creator_id IS NOT NULL AND c.id <> d.creator_id
ON CONFLICT DO NOTHING`,
);

await run(
  'direct payments',
  `
INSERT INTO direct_payments (id, deal_id, stage, amount_paise, reference, paid_to_vpa, recorded_by, recorded_at, confirmed_by, confirmed_at, created_at)
SELECT uuid7(d.published_at + s.offset_, row_number() OVER ()::bigint + 800000000), d.id, s.stage::direct_payment_stage,
       CASE WHEN s.stage = 'ADVANCE' THEN 273450 ELSE 638050 END, 'UTR' || md5(d.id::text || s.stage),
       'seed.creator@okaxis', d.brand_id, d.published_at + s.offset_, d.creator_id, d.published_at + s.offset_ + interval '1 hour', d.published_at + s.offset_
FROM deals d
JOIN LATERAL (VALUES ('ADVANCE', interval '3 days'), ('FINAL', interval '6 days')) s(stage, offset_) ON true
WHERE (s.stage = 'ADVANCE' AND d.status IN ('ADVANCE_PAID','CONTENT_UPLOADED','REVISION_REQUESTED','APPROVED','COMPLETED'))
   OR (s.stage = 'FINAL' AND d.status = 'COMPLETED')`,
);

await run(
  'deal events',
  `
INSERT INTO deal_events (id, deal_id, from_status, to_status, actor_type, created_at)
SELECT uuid7(d.published_at + e.o, row_number() OVER ()::bigint + 900000000), d.id, e.f::deal_status, e.t::deal_status, 'SYSTEM', d.published_at + e.o
FROM deals d
JOIN LATERAL (VALUES ('DRAFT','OPEN', interval '0 minutes'), ('OPEN','CONFIRMED', interval '1 day'), ('CONFIRMED','COMMISSION_PAID', interval '2 days'),
                     ('COMMISSION_PAID','ADVANCE_PAID', interval '3 days')) e(f, t, o) ON true
WHERE d.status <> 'DRAFT' AND d.status <> 'OPEN' AND d.creator_id IS NOT NULL`,
);

await run(
  'email log',
  `
INSERT INTO email_log (id, deal_id, user_id, to_email, template, subject, body_text, status, created_at, sent_at)
SELECT uuid7(d.published_at + k * interval '1 hour', row_number() OVER ()::bigint + 1000000000), d.id, d.brand_id, 'brand@example.com',
       'DEAL_PUBLISHED', 'Deal published', 'Body ' || k, 'SENT', d.published_at + k * interval '1 hour', d.published_at + k * interval '1 hour'
FROM deals d CROSS JOIN generate_series(1, 3) k WHERE d.status <> 'DRAFT'`,
);

await run(
  'disputes',
  `
INSERT INTO disputes (id, deal_id, raised_by_id, subject, description, status, resolution, resolved_by_id, resolved_at, created_at)
SELECT uuid7(d.published_at + interval '7 days', row_number() OVER ()::bigint + 1100000000), d.id, d.brand_id, 'Dispute ' || d.short_id, 'Details',
       CASE WHEN row_number() OVER () % 5 = 0 THEN 'OPEN'::dispute_status ELSE 'RESOLVED'::dispute_status END,
       CASE WHEN row_number() OVER () % 5 = 0 THEN NULL ELSE 'Settled' END,
       CASE WHEN row_number() OVER () % 5 = 0 THEN NULL ELSE d.brand_id END,
       CASE WHEN row_number() OVER () % 5 = 0 THEN NULL ELSE d.published_at + interval '8 days' END,
       d.published_at + interval '7 days'
FROM deals d WHERE d.status IN ('COMPLETED', 'CANCELLED') AND d.creator_id IS NOT NULL AND hashtext(d.id::text) % 40 = 0`,
);

await client.query('ANALYZE');
for (const t of [
  'users',
  'deals',
  'applications',
  'direct_payments',
  'deal_events',
  'email_log',
  'disputes',
]) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
  console.log(`${t.padEnd(16)} ${rows[0].n}`);
}
await client.end();
