import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compareMigrations,
  describeConnectionError,
  migrationProblems,
  readAppliedMigrations,
  readKnownMigrations,
  verifyDatabase,
} from '../../src/db/startupCheck.js';
import { closeDb, pool, resetDb } from './testDb.js';
import { buildRawTestEnv } from '../testEnv.js';

const API_ROOT = path.resolve(import.meta.dirname, '../..');

const known = [
  { tag: '0000_a', hash: 'hash-a' },
  { tag: '0001_b', hash: 'hash-b' },
  { tag: '0002_c', hash: 'hash-c' },
];

describe('compareMigrations', () => {
  it('finds nothing when the database has exactly the migrations in the code', () => {
    const applied = known.map((m, i) => ({ hash: m.hash, createdAt: i }));
    expect(compareMigrations(known, applied)).toEqual({ unapplied: [], unknown: [] });
  });

  it('names the migrations the code has and the database has not', () => {
    const result = compareMigrations(known, [{ hash: 'hash-a', createdAt: 1 }]);
    expect(result.unapplied.map((m) => m.tag)).toEqual(['0001_b', '0002_c']);
    expect(result.unknown).toEqual([]);
  });

  it('finds an older one that is missing even when a newer one is applied', () => {
    const result = compareMigrations(known, [
      { hash: 'hash-a', createdAt: 1 },
      { hash: 'hash-c', createdAt: 3 },
    ]);
    expect(result.unapplied.map((m) => m.tag)).toEqual(['0001_b']);
  });

  it('finds migrations the database has and the code does not know', () => {
    const applied = [
      ...known.map((m, i) => ({ hash: m.hash, createdAt: i })),
      { hash: 'x'.repeat(20), createdAt: 9 },
    ];
    const result = compareMigrations(known, applied);
    expect(result.unapplied).toEqual([]);
    expect(result.unknown).toEqual([{ hash: 'x'.repeat(20), createdAt: 9 }]);
  });

  it('shows an edited merged migration as both unapplied and unknown', () => {
    const applied = [
      { hash: 'hash-a', createdAt: 1 },
      { hash: 'old-b', createdAt: 2 },
      { hash: 'hash-c', createdAt: 3 },
    ];
    const result = compareMigrations(known, applied);
    expect(result.unapplied.map((m) => m.tag)).toEqual(['0001_b']);
    expect(result.unknown.map((m) => m.hash)).toEqual(['old-b']);
  });
});

describe('migrationProblems', () => {
  it('is empty when nothing differs', () => {
    expect(migrationProblems({ unapplied: [], unknown: [] })).toEqual([]);
  });

  it('names the unapplied migrations and says to run them by hand', () => {
    const [message] = migrationProblems({ unapplied: known.slice(1), unknown: [] });
    expect(message).toContain('2 migration(s) the database has not applied: 0001_b, 0002_c');
    expect(message).toContain('Run them by hand');
  });

  it('names the unknown migrations with their hash and time', () => {
    const [message] = migrationProblems({
      unapplied: [],
      unknown: [{ hash: 'abcdef0123456789', createdAt: Date.UTC(2026, 9, 21, 6, 30) }],
    });
    expect(message).toContain('1 migration(s) this code does not know');
    expect(message).toContain('abcdef0123');
    expect(message).toContain('2026-10-21T06:30:00.000Z');
    expect(message).toContain('older than the database');
  });
});

describe('describeConnectionError', () => {
  it.each([
    [{ code: 'ENOTFOUND' }, 'ENOTFOUND'],
    [{ code: 'ECONNREFUSED' }, 'ECONNREFUSED'],
    [{ code: '28P01' }, '28P01'],
    [{ code: '3D000' }, '3D000'],
  ])('uses the code for %j', (err, text) => {
    expect(describeConnectionError(err)).toContain(text);
  });

  it('explains a timeout', () => {
    expect(describeConnectionError(new Error('timeout exceeded when trying to connect'))).toContain(
      'timeout',
    );
  });

  it('points at sslmode for a TLS failure', () => {
    expect(
      describeConnectionError(new Error('The server does not support SSL connections')),
    ).toContain('sslmode=require');
  });

  it('never repeats the message it was given', () => {
    const text = describeConnectionError(
      Object.assign(
        new Error('password authentication failed for user "owner" at ep-secret-host'),
        {
          code: '28P01',
        },
      ),
    );
    expect(text).not.toContain('owner');
    expect(text).not.toContain('ep-secret-host');
  });
});

describe('readKnownMigrations', () => {
  it('reads every migration in the journal, in order, with its hash', () => {
    const migrations = readKnownMigrations();
    expect(migrations.length).toBeGreaterThanOrEqual(12);
    expect(migrations[0]!.tag).toBe('0000_chubby_lifeguard');
    expect(migrations.map((m) => m.tag)).toContain('0011_hot_query_indexes');
    expect(new Set(migrations.map((m) => m.hash)).size).toBe(migrations.length);
    for (const m of migrations) expect(m.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('against a real database', () => {
  beforeAll(resetDb);
  afterAll(closeDb);

  /** Runs `change` in a transaction, checks the database, and rolls the change back. */
  async function checkAfter(change: string[]) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const statement of change) await client.query(statement);
      return await verifyDatabase(client);
    } finally {
      await client.query('rollback');
      client.release();
    }
  }

  it('finds no problem when the migrations match the code', async () => {
    const result = await verifyDatabase(pool);
    expect(result.problems).toEqual([]);
    expect((await readAppliedMigrations(pool)).length).toBe(readKnownMigrations().length);
  });

  it('names a migration the database has not applied', async () => {
    const { problems } = await checkAfter([
      'delete from drizzle.__drizzle_migrations where id = (select max(id) from drizzle.__drizzle_migrations)',
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      '1 migration(s) the database has not applied: 0011_hot_query_indexes',
    );
  });

  it('names a migration the code does not know', async () => {
    const { problems } = await checkAfter([
      `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${'f'.repeat(64)}', 4102444800000)`,
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('1 migration(s) this code does not know');
    expect(problems[0]).toContain('ffffffffff');
  });

  it('reports an edited migration both ways', async () => {
    const { problems } = await checkAfter([
      `update drizzle.__drizzle_migrations set hash = '${'e'.repeat(64)}' where id = (select max(id) from drizzle.__drizzle_migrations)`,
    ]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('0011_hot_query_indexes');
    expect(problems[1]).toContain('eeeeeeeeee');
  });

  it('treats a database that was never migrated as having applied nothing', async () => {
    const { problems } = await checkAfter(['drop schema drizzle cascade']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      `${readKnownMigrations().length} migration(s) the database has not applied: 0000_chubby_lifeguard`,
    );
  });
});

describe('when the database cannot be reached', () => {
  it('says why, names the host, and never repeats the password', async () => {
    const url = 'postgres://owner:sekrit-pw@127.0.0.1:1/valueskins?sslmode=require';
    const closed = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
    closed.on('error', () => {});
    try {
      const { problems, host } = await verifyDatabase(closed, { databaseUrl: url });
      expect(host).toBe('127.0.0.1');
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('Could not connect to the database at 127.0.0.1');
      expect(problems[0]).not.toContain('sekrit-pw');
      expect(problems[0]).not.toContain('owner');
    } finally {
      await closed.end();
    }
  });
});

describe('the startup exit (a child process, like the real start)', () => {
  function start(databaseUrl: string) {
    return spawnSync('npx', ['tsx', 'test/db/fixtures/startupDb.ts'], {
      cwd: API_ROOT,
      env: {
        ...process.env,
        ...buildRawTestEnv({ NODE_ENV: 'development', DATABASE_URL: databaseUrl }),
        SENTRY_DSN: '',
      },
      encoding: 'utf8',
    });
  }

  it('exits 1 with the reason when the database cannot be reached', () => {
    const result = start('postgres://owner:sekrit-pw@127.0.0.1:1/valueskins?sslmode=require');
    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Could not connect to the database at 127.0.0.1');
    expect(output).toContain('ECONNREFUSED');
    expect(output).toContain('Startup check failed');
    expect(output).not.toContain('sekrit-pw');
  }, 30_000);

  it('starts when the database matches the code', () => {
    const result = start(buildRawTestEnv().TEST_DATABASE_URL!);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('database ok');
  }, 30_000);
});
