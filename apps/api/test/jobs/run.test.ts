import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRawTestEnv } from '../testEnv.js';

const API_ROOT = path.resolve(import.meta.dirname, '../..');

/** `pnpm job` (src/jobs/run.ts), run as a real child process like the command line does. */
function runJobScript(...args: string[]) {
  return spawnSync('npx', ['tsx', 'src/jobs/run.ts', ...args], {
    cwd: API_ROOT,
    env: { ...process.env, ...buildRawTestEnv() },
    encoding: 'utf8',
  });
}

describe('pnpm job', () => {
  it('lists the jobs and their schedules with --list', () => {
    const result = runJobScript('--list');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('fee-reminder');
    expect(result.stdout).toContain('0 */6 * * *');
    expect(result.stdout.trim().split('\n')).toHaveLength(7);
  });

  it('refuses an unknown job with exit 1 and the list of names', () => {
    const result = runJobScript('not-a-job');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown job "not-a-job"');
    expect(result.stderr).toContain('cleanup');
  });

  it('lists the jobs and exits 1 when no name is given', () => {
    const result = runJobScript();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('instagram-refresh');
  });
});
