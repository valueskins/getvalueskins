import { createApp } from './app.js';
import { closeDb } from './db/client.js';
import { getEnv } from './env/index.js';
import { startScheduler } from './jobs/scheduler.js';
import { logger } from './logging/logger.js';
import { razorpayModeFromKeyId } from './razorpay/mode.js';

const env = getEnv();

// SPEC 7.1: log the Razorpay mode at startup (the startup guards already enforce it).
logger.info({ razorpayMode: razorpayModeFromKeyId(env.RAZORPAY_KEY_ID) }, 'razorpay mode');
const app = createApp(env);

const server = app.listen(env.PORT, () => {
  console.log(`api listening on port ${env.PORT}`);
});

// SPEC 14: the jobs run in this process, each under a Postgres advisory lock.
const scheduler = startScheduler({ env, now: () => new Date() });

process.on('SIGTERM', () => {
  // Stop the schedules and let a running job finish before the connections close.
  scheduler
    .stop()
    .catch((err: unknown) => console.error(err))
    .finally(() => {
      server.close(() => {
        closeDb()
          .then(() => process.exit(0))
          .catch((err: unknown) => {
            console.error(err);
            process.exit(1);
          });
      });
    });
});
