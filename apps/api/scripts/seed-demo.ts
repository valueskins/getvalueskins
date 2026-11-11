/**
 * Local review data for the web app: one brand, three creators, a deal in every status, more
 * applicants on the open deals, and UPI payments at every stage (recorded and waiting for the
 * creator, marked not received, confirmed). Every deal is reached the way `db:seed` reaches it
 * (insertDealAtCheckpoint), so its events, payments and documents match a real path.
 *
 * Dev only. It truncates the database, so it refuses to run when NODE_ENV=production or when
 * DATABASE_URL is not on this machine.
 *
 *   pnpm db:migrate && pnpm db:seed-demo
 *
 * Then sign in at /dev/login as kurta.co.example (brand), or meera.styles.example,
 * rohan.eats.example or anaya.reels.example (creators).
 */
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function refuseUnlessLocal(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:seed-demo refuses to run when NODE_ENV=production.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`db:seed-demo refuses to run against "${host}": only a local database.`);
  }
}

refuseUnlessLocal();

const { eq, sql } = await import('drizzle-orm');
const { computeBreakdown, rupeesToPaise } = await import('@valueskins/shared');
const { db, closeDb } = await import('../src/db/client.js');
const { applications, brandBilling, dealEvents, deals, directPayments, users } =
  await import('../src/db/schema/index.js');
const { insertDealAtCheckpoint } = await import('../src/db/seed/dealMatrix.js');
const { getEnv } = await import('../src/env/index.js');
const { companyFromEnv } = await import('../src/invoices/snapshot.js');
type DealStatus = import('@valueskins/shared').DealStatus;

const TABLES = [
  'deal_events',
  'email_log',
  'disputes',
  'invoices',
  'invoice_counters',
  'direct_payments',
  'payments',
  'content_uploads',
  'applications',
  'deals',
  'sessions',
  'email_verification_tokens',
  'brand_billing',
  'meta_deletion_requests',
  'webhook_events',
  'users',
];

const BRAND = 'kurta.co.example';
const CREATORS = [
  {
    username: 'meera.styles.example',
    name: 'Meera (example)',
    city: 'Pune',
    age: 26,
    gender: 'FEMALE',
    followers: 48_250,
    engagement: '3.40',
    media: 412,
  },
  {
    username: 'rohan.eats.example',
    name: 'Rohan (example)',
    city: 'Mumbai',
    age: 29,
    gender: 'MALE',
    followers: 31_900,
    engagement: '4.20',
    media: 288,
  },
  {
    username: 'anaya.reels.example',
    name: 'Anaya (example)',
    city: 'Bengaluru',
    age: 23,
    gender: 'FEMALE',
    followers: 76_100,
    engagement: '2.60',
    media: 905,
  },
] as const;

/** Today's date in India Standard Time plus a whole number of days, as YYYY-MM-DD. */
function istDate(daysFromToday: number, now: Date = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

/** One deal per status, plus a second Fee paid deal and two more open ones. `creator` indexes CREATORS. */
const DEALS: Array<{
  status: DealStatus;
  title: string;
  rupees: number;
  creator: number;
  what: string;
  /** Days from today in India Standard Time: positive is still open, negative has passed. */
  applyByDays: number;
}> = [
  {
    status: 'DRAFT',
    title: 'Winter shawl styling reel',
    rupees: 9_000,
    creator: 0,
    what: '1 reel, 30 to 45 seconds',
    applyByDays: 14,
  },
  {
    status: 'OPEN',
    title: 'Festive kurta try-on reel',
    rupees: 15_000,
    creator: 0,
    what: '1 reel, 30 to 45 seconds',
    applyByDays: 7,
  },
  {
    status: 'CONFIRMED',
    title: 'Wedding guest lookbook carousel',
    rupees: 25_000,
    creator: 2,
    what: '1 carousel of 8 photos',
    applyByDays: -22,
  },
  {
    status: 'COMMISSION_PAID',
    title: 'Diwali gifting unboxing reel',
    rupees: 12_000,
    creator: 0,
    what: '1 reel and 3 stories',
    applyByDays: -24,
  },
  {
    status: 'ADVANCE_PAID',
    title: 'Block print saree story set',
    rupees: 18_000,
    creator: 1,
    what: '5 stories with a link sticker',
    applyByDays: -27,
  },
  {
    status: 'CONTENT_UPLOADED',
    title: 'Monsoon cotton edit reel',
    rupees: 9_000,
    creator: 2,
    what: '1 reel, 20 to 30 seconds',
    applyByDays: -32,
  },
  {
    status: 'REVISION_REQUESTED',
    title: 'Office wear try-on haul',
    rupees: 14_000,
    creator: 0,
    what: '1 reel with 4 outfits',
    applyByDays: -34,
  },
  {
    status: 'APPROVED',
    title: 'Handloom dupatta styling short',
    rupees: 8_000,
    creator: 1,
    what: '1 reel, 15 to 30 seconds',
    applyByDays: -37,
  },
  {
    status: 'COMPLETED',
    title: 'Summer linen kurta reel',
    rupees: 10_000,
    creator: 2,
    what: '1 reel, 30 to 45 seconds',
    applyByDays: -52,
  },
  {
    status: 'CANCELLED',
    title: 'Navratri chaniya choli reel',
    rupees: 20_000,
    creator: 0,
    what: '1 reel and 2 posts',
    applyByDays: -41,
  },
  {
    status: 'COMMISSION_PAID',
    title: 'Sangeet outfit transition reel',
    rupees: 16_000,
    creator: 1,
    what: '1 transition reel',
    applyByDays: -23,
  },
  {
    status: 'OPEN',
    title: 'Everyday kurti three ways',
    rupees: 7_500,
    creator: 0,
    what: '1 reel, 3 looks',
    applyByDays: 14,
  },
  {
    status: 'OPEN',
    title: "Men's festive kurta fit check",
    rupees: 11_000,
    creator: 0,
    what: '1 reel and 2 stories',
    applyByDays: 21,
  },
];

/** A brief written to the deal template (DEAL_DESCRIPTION_TEMPLATE). */
function brief(what: string): string {
  return [
    `Content type: ${what}`,
    'Shooting: At home or outdoors in daylight. No studio needed.',
    'Travel: Not provided',
    'Timeline: Shoot by 12 Nov, post between 14 and 18 Nov',
    'Approval: 1 round of changes, we reply within 2 days',
    'Rights: We may repost on our page for 6 months',
    'Deliverables: 1080x1920 MP4 with captions in English',
    'Restrictions: No other clothing brands in frame',
    'Delivery: Upload to Google Drive and share the link on ValueSkins',
    '',
    'Additional notes:',
    `Show the fabric up close in natural light. Tag @${BRAND} in the caption.`,
  ].join('\n');
}

const shortId = (index: number) => `SEED${String(index).padStart(4, '0')}`;
const SHARED_CONTENT = 'https://drive.google.com/file/d/example-content/view';
const NOT_ARRIVED = 'Nothing arrived in my account for this reference.';

async function main(): Promise<void> {
  const company = companyFromEnv(getEnv());
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} CASCADE`));

  const now = new Date();
  const onboarded = {
    roleLockedAt: now,
    igTokenEncrypted: 'seed-encrypted-token',
    igTokenExpiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    instagramSyncedAt: now,
    emailVerifiedAt: now,
    onboardingCompletedAt: now,
    profileLockedAt: now,
    adultConfirmedAt: now,
  };

  const [brand] = await db
    .insert(users)
    .values({
      ...onboarded,
      instagramUserId: 'ig_demo_brand',
      username: BRAND,
      name: 'Kurta Co (example)',
      igAccountType: 'BUSINESS',
      role: 'BRAND',
      email: 'brand@example.com',
      city: 'Jaipur',
      website: 'https://kurta.example',
      pitch: 'Hand block printed kurtas and sarees from Jaipur. We hire creators for try-on reels.',
      followersCount: 18_400,
      followsCount: 310,
      mediaCount: 642,
      bio: 'Block printed in Jaipur. Example account.',
    })
    .returning();
  if (!brand) throw new Error('failed to insert the demo brand');
  await db.insert(brandBilling).values({
    userId: brand.id,
    billingName: 'Kurta Co Example Private Limited',
    billingAddress: '14 Johari Bazaar, Jaipur',
    billingState: 'Rajasthan',
    gstin: '08ABCDE1234F1Z5',
  });

  const creators: Array<{ id: string; vpa: string }> = [];
  for (const [i, c] of CREATORS.entries()) {
    const vpa = `${c.username.split('.')[0]}.example@okaxis`;
    const [row] = await db
      .insert(users)
      .values({
        ...onboarded,
        instagramUserId: `ig_demo_creator_${i + 1}`,
        username: c.username,
        name: c.name,
        igAccountType: 'MEDIA_CREATOR',
        role: 'CREATOR',
        email: `creator${i + 1}@example.com`,
        city: c.city,
        age: c.age,
        ageRecordedAt: now,
        gender: c.gender,
        followersCount: c.followers,
        followsCount: 500 + i * 120,
        mediaCount: c.media,
        engagementRate: c.engagement,
        bio: 'Fashion and food reels. Example account.',
        payoutVpa: vpa,
        payoutName: c.name,
        payoutVpaConsentAt: now,
      })
      .returning();
    if (!row) throw new Error(`failed to insert ${c.username}`);
    creators.push({ id: row.id, vpa });
  }
  const creator = (i: number) => {
    const c = creators[i];
    if (!c) throw new Error(`no demo creator ${i}`);
    return c;
  };

  for (const [index, d] of DEALS.entries()) {
    await insertDealAtCheckpoint(db, {
      status: d.status,
      index,
      brandId: brand.id,
      confirmedCreatorId: creator(d.creator).id,
      confirmedCreatorVpa: creator(d.creator).vpa,
      applicantCreatorId: creator(2).id,
      budgetRupees: d.rupees,
      applicationDeadline: istDate(d.applyByDays),
      contentUploadDeadline: istDate(45),
      dealDeadline: istDate(60),
      company,
    });
    // Realistic words in place of the matrix's placeholders. The status is never touched.
    const shared = ['CONTENT_UPLOADED', 'REVISION_REQUESTED', 'APPROVED', 'COMPLETED'].includes(
      d.status,
    );
    await db
      .update(deals)
      .set({
        title: d.title,
        description: brief(d.what),
        ...(shared ? { contentLink: SHARED_CONTENT } : {}),
        ...(d.status === 'REVISION_REQUESTED'
          ? {
              feedback:
                'Lovely energy. Please reshoot the second outfit outdoors so the print shows.',
            }
          : {}),
        ...(d.status === 'CANCELLED'
          ? { cancellationReason: 'We moved this collection to next season.' }
          : {}),
      })
      .where(eq(deals.shortId, shortId(index)));
  }
  await db.execute(
    sql`UPDATE content_uploads SET link = ${SHARED_CONTENT} WHERE link LIKE '%seed-content%'`,
  );
  await db.execute(
    sql`UPDATE direct_payments SET dispute_reason = ${NOT_ARRIVED} WHERE dispute_reason IS NOT NULL`,
  );
  await db.execute(sql`UPDATE deal_events SET note = ${NOT_ARRIVED} WHERE note LIKE 'Seed data%'`);

  const dealAt = async (index: number) => {
    const [row] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.shortId, shortId(index)));
    if (!row) throw new Error(`no demo deal ${index}`);
    return row.id;
  };

  // The brand chooses between all three creators on the open deals.
  const MORE_APPLICANTS: Array<[number, number[]]> = [
    [1, [0, 1]],
    [11, [0, 1]],
    [12, [1]],
  ];
  for (const [index, extra] of MORE_APPLICANTS) {
    const dealId = await dealAt(index);
    for (const c of extra) {
      await db.insert(applications).values({ dealId, creatorId: creator(c).id, status: 'APPLIED' });
    }
  }

  /** A UPI payment the brand recorded that the creator has not confirmed yet, as the API writes it. */
  const recordedOnly = async (index: number, stage: 'ADVANCE' | 'FINAL', status: DealStatus) => {
    const d = DEALS[index]!;
    const dealId = await dealAt(index);
    const breakdown = computeBreakdown(rupeesToPaise(d.rupees));
    const [record] = await db
      .insert(directPayments)
      .values({
        dealId,
        stage,
        amountPaise: stage === 'ADVANCE' ? breakdown.advancePaise : breakdown.finalPaise,
        reference: `UTR4182${index}${stage === 'ADVANCE' ? 1 : 2}907`,
        paidToVpa: creator(d.creator).vpa,
        recordedBy: brand.id,
        recordedAt: now,
      })
      .returning();
    if (!record) throw new Error(`failed to record a payment on deal ${index}`);
    await db.insert(dealEvents).values({
      dealId,
      fromStatus: status,
      toStatus: status,
      actorId: brand.id,
      actorType: 'USER',
      note: null,
      metadata: { kind: 'PAYMENT_RECORDED', directPaymentId: record.id, stage },
    });
  };
  await recordedOnly(10, 'ADVANCE', 'COMMISSION_PAID');
  await recordedOnly(7, 'FINAL', 'APPROVED');

  console.log(
    `seed-demo complete: 1 brand (${BRAND}), ${CREATORS.length} creators, ${DEALS.length} deals`,
  );
}

try {
  await main();
} finally {
  await closeDb();
}
