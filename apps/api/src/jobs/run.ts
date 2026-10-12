/**
 * Runs one job once, by hand: `pnpm job <name>`, or `pnpm job --list` (SPEC 14). It uses the real
 * clock, takes the same advisory lock as the schedule, and exits 1 if the job fails. In the
 * Render Shell use `pnpm --filter @valueskins/api run job:deploy -- <name>`.
 */
// A module (not a script), so `main` does not clash with the one in db/seed.ts.
export {};

async function main(): Promise<number> {
  const { JOBS, findJob } = await import('./registry.js');
  const arg = process.argv.slice(2).find((a) => a !== '--');

  if (!arg || arg === '--list') {
    for (const job of JOBS)
      console.log(`${job.name.padEnd(26)}${job.schedule.padEnd(14)}${job.description}`);
    return arg ? 0 : 1;
  }

  const job = findJob(arg);
  if (!job) {
    console.error(`Unknown job "${arg}". Jobs: ${JOBS.map((j) => j.name).join(', ')}`);
    return 1;
  }

  const { getEnv } = await import('../env/index.js');
  const { runJob } = await import('./runJob.js');
  const result = await runJob(job, { env: getEnv(), now: () => new Date() });
  console.log(JSON.stringify(result));
  return result.status === 'failed' ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { closeDb } = await import('../db/client.js');
    await closeDb();
  });
