import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRawTestEnv } from '../testEnv.js';

const API_ROOT = path.resolve(import.meta.dirname, '../..');
const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/callGetEnv.ts');

function runFixture(envOverrides: Partial<NodeJS.ProcessEnv>) {
  return spawnSync('npx', ['tsx', FIXTURE], {
    cwd: API_ROOT,
    env: { ...process.env, ...buildRawTestEnv(envOverrides) },
    encoding: 'utf8',
  });
}

describe('getEnv() process.exit behavior (child process smoke test)', () => {
  it('exits 0 and prints the success line for a valid env', () => {
    const result = runFixture({});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('env ok');
  });

  it('exits 1 with a clear message when a startup guard fails', () => {
    const result = runFixture({
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'true',
      RAZORPAY_KEY_ID: 'rzp_live_x',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Startup guard failed');
    expect(result.stderr).toContain('ENABLE_DEV_LOGIN');
  });

  it('exits 1 with a clear message when the env is invalid', () => {
    // An invalid (present-but-wrong) value, not a missing key: getEnv() calls
    // loadEnvFile('.env') internally, which only fills in keys that are
    // genuinely absent — an existing key with a wrong value is never
    // overwritten, so this stays deterministic regardless of what the real
    // local .env file contains.
    const result = runFixture({ WEB_ORIGIN: 'not-a-url' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid environment configuration');
  });
});
