import { describe, expect, it } from 'vitest';
import {
  databaseHost,
  databaseUrlProblems,
  isLocalDatabaseHost,
} from '../../src/db/databaseUrl.js';

const NEON_DIRECT =
  'postgresql://owner:secret-pw@ep-cool-darkness-123456.ap-southeast-1.aws.neon.tech/valueskins?sslmode=require';
const NEON_POOLED =
  'postgresql://owner:secret-pw@ep-cool-darkness-123456-pooler.ap-southeast-1.aws.neon.tech/valueskins?sslmode=require';

describe('databaseHost', () => {
  it('reads the host', () => {
    expect(databaseHost(NEON_DIRECT)).toBe('ep-cool-darkness-123456.ap-southeast-1.aws.neon.tech');
    expect(databaseHost('postgres://u:p@localhost:5432/db')).toBe('localhost');
  });

  it('is null when there is no host to read', () => {
    expect(databaseHost('')).toBeNull();
    expect(databaseHost('not a url')).toBeNull();
  });
});

describe('isLocalDatabaseHost', () => {
  it.each(['localhost', '127.0.0.1', '::1'])('%s is local', (host) => {
    expect(isLocalDatabaseHost(host)).toBe(true);
  });
  it('a Neon host is not', () => {
    expect(isLocalDatabaseHost('ep-x.ap-southeast-1.aws.neon.tech')).toBe(false);
    expect(isLocalDatabaseHost(null)).toBe(false);
  });
});

describe('databaseUrlProblems', () => {
  it('accepts the Neon direct string with TLS', () => {
    expect(databaseUrlProblems(NEON_DIRECT, { requireTls: true })).toEqual([]);
  });

  it('refuses a pooled host, with or without TLS being required', () => {
    for (const requireTls of [true, false]) {
      expect(databaseUrlProblems(NEON_POOLED, { requireTls })).toEqual([
        'DATABASE_URL points at a pooled host (its name contains "-pooler"). Use the direct connection string: advisory locks need it',
      ]);
    }
  });

  it('refuses a missing or weak sslmode when TLS is required', () => {
    const tls = 'DATABASE_URL must include sslmode=require (TLS is required)';
    expect(databaseUrlProblems('postgres://u:p@db.example.com/x', { requireTls: true })).toEqual([
      tls,
    ]);
    for (const mode of ['disable', 'allow', 'prefer', 'no-verify']) {
      expect(
        databaseUrlProblems(`postgres://u:p@db.example.com/x?sslmode=${mode}`, {
          requireTls: true,
        }),
      ).toEqual([tls]);
    }
  });

  it.each(['require', 'verify-ca', 'verify-full'])('accepts sslmode=%s', (mode) => {
    expect(
      databaseUrlProblems(`postgres://u:p@db.example.com/x?sslmode=${mode}`, { requireTls: true }),
    ).toEqual([]);
    expect(
      databaseUrlProblems(`postgres://u:p@db.example.com/x?x=1&sslmode=${mode}`, {
        requireTls: true,
      }),
    ).toEqual([]);
  });

  it('does not ask for TLS when it is not required (a local database)', () => {
    expect(databaseUrlProblems('postgres://u:p@localhost:5432/db', { requireTls: false })).toEqual(
      [],
    );
  });

  it('never repeats the connection string, which holds the password', () => {
    const all = [
      ...databaseUrlProblems(NEON_POOLED, { requireTls: true }),
      ...databaseUrlProblems('postgres://owner:secret-pw@db.example.com/x', { requireTls: true }),
    ].join(' ');
    expect(all).not.toContain('secret-pw');
    expect(all).not.toContain('owner');
  });
});
