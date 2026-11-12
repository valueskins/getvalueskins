import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compareMigrations,
  describeConnectionError,
  migrationProblems,
  migrationWarnings,
  readAppliedMigrations,
  readKnownMigrations,
  verifyDatabase,
} from '../../src/db/startupCheck.js';
import { closeDb, pool, resetDb } from './testDb.js';
import { buildRawTestEnv } from '../testEnv.js';

const API_ROOT = path.resolve(import.meta.dirname, '../..');

// The pool is shared by the describes below that use the real database, so it closes once, last.
afterAll(closeDb);

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

  it('is not a problem when the database has migrations the code does not know', () => {
    expect(
      migrationProblems({
        unapplied: [],
        unknown: [{ hash: 'abcdef0123456789', createdAt: Date.UTC(2026, 9, 21, 6, 30) }],
      }),
    ).toEqual([]);
  });
});

describe('migrationWarnings', () => {
  it('is empty when the database has nothing the code does not know', () => {
    expect(migrationWarnings({ unapplied: known.slice(1), unknown: [] })).toEqual([]);
  });

  it('names the unknown migrations with their hash and time, and says the database is ahead', () => {
    const [message, ...rest] = migrationWarnings({
      unapplied: [],
      unknown: [
        { hash: 'abcdef0123456789', createdAt: Date.UTC(2026, 9, 21, 6, 30) },
        { hash: '0123456789abcdef', createdAt: Date.UTC(2026, 9, 22, 7, 45) },
      ],
    });
    expect(rest).toEqual([]);
    expect(message).toContain('2 migration(s) this code does not know');
    expect(message).toContain('abcdef0123, 0123456789');
    expect(message).toContain('2026-10-21T06:30:00.000Z, 2026-10-22T07:45:00.000Z');
    expect(message).toContain('The database is ahead of this code.');
    expect(message).not.toContain('Starting anyway');
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
    expect(migrations.map((m) => m.tag)).toContain('0013_fancy_wolfsbane');
    expect(new Set(migrations.map((m) => m.hash)).size).toBe(migrations.length);
    for (const m of migrations) expect(m.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('against a real database', () => {
  beforeAll(resetDb);

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
    const { problems, warnings } = await checkAfter([
      'delete from drizzle.__drizzle_migrations where id = (select max(id) from drizzle.__drizzle_migrations)',
    ]);
    expect(warnings).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      '1 migration(s) the database has not applied: 0013_fancy_wolfsbane',
    );
  });

  it('only warns about a migration the code does not know: the database is ahead', async () => {
    const { problems, warnings } = await checkAfter([
      `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${'f'.repeat(64)}', 4102444800000)`,
    ]);
    expect(problems).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('1 migration(s) this code does not know');
    expect(warnings[0]).toContain('ffffffffff');
    expect(warnings[0]).toContain('The database is ahead of this code.');
  });

  it('warns about every unknown migration at once, and still finds none unapplied', async () => {
    const { problems, warnings } = await checkAfter([
      `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${'a'.repeat(64)}', 4102444800000)`,
      `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${'b'.repeat(64)}', 4102444900000)`,
    ]);
    expect(problems).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2 migration(s) this code does not know');
    expect(warnings[0]).toContain('aaaaaaaaaa, bbbbbbbbbb');
  });

  it('reports an edited migration both ways: the new version is a problem, the old one a warning', async () => {
    const { problems, warnings } = await checkAfter([
      `update drizzle.__drizzle_migrations set hash = '${'e'.repeat(64)}' where id = (select max(id) from drizzle.__drizzle_migrations)`,
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('0013_fancy_wolfsbane');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('eeeeeeeeee');
  });

  it('treats a database that was never migrated as having applied nothing', async () => {
    const { problems, warnings } = await checkAfter(['drop schema drizzle cascade']);
    expect(warnings).toEqual([]);
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

  const testDatabaseUrl = buildRawTestEnv().TEST_DATABASE_URL!;

  it('starts when the database matches the code', () => {
    const result = start(testDatabaseUrl);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('database ok');
    expect(result.stdout).toContain('database reachable, migrations match the code');
    expect(result.stdout).not.toContain('"level":40');
  }, 30_000);

  it('starts, with a warning naming the migration, when the database is ahead of the code', async () => {
    const hash = 'c'.repeat(64);
    await pool.query(
      `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${hash}', 4102444800000)`,
    );
    try {
      const result = start(testDatabaseUrl);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('database ok');
      const output = result.stdout + result.stderr;
      expect(output).toContain('"level":40');
      expect(output).toContain('1 migration(s) this code does not know');
      expect(output).toContain('cccccccccc');
      expect(output).toContain('Starting anyway');
      expect(output).not.toContain('Startup check failed');
    } finally {
      await pool.query(`delete from drizzle.__drizzle_migrations where hash = '${hash}'`);
    }
  }, 30_000);

  it('exits 1, naming the migration, when the code has one the database has not applied', async () => {
    const { rows } = await pool.query<{ hash: string; created_at: string }>(
      'delete from drizzle.__drizzle_migrations where id = (select max(id) from drizzle.__drizzle_migrations) returning hash, created_at',
    );
    try {
      const result = start(testDatabaseUrl);
      expect(result.status).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('1 migration(s) the database has not applied: 0013_fancy_wolfsbane');
      expect(output).toContain('Startup check failed');
      expect(output).not.toContain('database ok');
    } finally {
      await pool.query(
        'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
        [rows[0]!.hash, rows[0]!.created_at],
      );
    }
  }, 30_000);
});
