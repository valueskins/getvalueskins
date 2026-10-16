/**
 * `pnpm notify:launch --audience brands|creators [--send]` (SPEC 8, DEPLOYMENT "Opening payments
 * and posting"). Dry run by default: it prints counts and sends nothing. With `--send` it emails
 * each onboarded account of the audience once. In the Render Shell use
 * `pnpm --filter @valueskins/api run notify:launch:deploy -- --audience brands --send`.
 */
// A module (not a script), so `main` does not clash with the one in db/seed.ts.
export {};

import { parseArgs } from 'node:util';
import '../instrument.js';

const USAGE = 'Usage: pnpm notify:launch --audience brands|creators [--send]';

async function main(): Promise<number> {
  let values: { audience?: string; send?: boolean };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2).filter((a) => a !== '--'),
      options: { audience: { type: 'string' }, send: { type: 'boolean' } },
      strict: true,
    }));
  } catch {
    console.error(USAGE);
    return 1;
  }

  const { LAUNCH_AUDIENCES, runLaunchNotify } = await import('../launch/notify.js');
  const audience = LAUNCH_AUDIENCES.find((a) => a === values.audience);
  if (!audience) {
    console.error(USAGE);
    return 1;
  }

  const { getEnv } = await import('../env/index.js');
  const result = await runLaunchNotify(
    { env: getEnv(), now: () => new Date() },
    { audience, send: values.send === true },
  );
  if (!result) {
    console.error('Another notify:launch run is in progress. Try again when it ends.');
    return 1;
  }

  console.log(JSON.stringify(result));
  if (!result.sent) console.log('Dry run: nothing was sent. Add --send to send.');
  return result.failed > 0 ? 1 : 0;
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
    const { flushSentry } = await import('../observability/sentry.js');
    await flushSentry();
  });
