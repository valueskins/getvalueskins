import './instrument.js';
import { createApp } from './app.js';
import { closeDb } from './db/client.js';
import { exitUnlessDatabaseReady } from './db/exitUnlessDatabaseReady.js';
import { getEnv } from './env/index.js';
import { startScheduler } from './jobs/scheduler.js';
import { logger } from './logging/logger.js';
import { captureError, flushSentry } from './observability/sentry.js';
import { razorpayModeFromKeyId } from './razorpay/mode.js';
import { attachRealtime } from './realtime/server.js';

const env = getEnv();

// SPEC 7.1: log the Razorpay mode at startup (the startup guards already enforce it). The keys are
// optional while payments are off.
logger.info(
  {
    razorpayMode: env.RAZORPAY_KEY_ID === '' ? 'none' : razorpayModeFromKeyId(env.RAZORPAY_KEY_ID),
    paymentsMode: env.PAYMENTS_MODE,
    dealPostingMode: env.DEAL_POSTING_MODE,
    hostingTier: env.HOSTING_TIER,
  },
  'razorpay mode, launch modes and hosting tier',
);

// SPEC 19: the database answers and its migrations match the code, or the API does not start.
await exitUnlessDatabaseReady(env.DATABASE_URL);

const app = createApp(env);

const server = app.listen(env.PORT, () => {
  console.log(`api listening on port ${env.PORT}`);
});

const ctx = { env, now: () => new Date() };

// SPEC 10: Socket.io on the same HTTP server. One instance only (a second needs the Redis adapter).
const realtime = attachRealtime(server, ctx);

// SPEC 14: the jobs run in this process, each under a Postgres advisory lock.
const scheduler = startScheduler(ctx);

// An error nobody caught is reported, logged and ends the process (Render restarts it). A rejected
// promise is reported and logged only: the request that caused it has already been answered.
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ err: reason }, 'unhandled rejection');
  captureError(reason, 'unhandledRejection');
});
process.on('uncaughtException', (error: Error) => {
  logger.error({ err: error }, 'uncaught exception');
  captureError(error, 'uncaughtException');
  flushSentry().finally(() => process.exit(1));
});

process.on('SIGTERM', () => {
  // Close the sockets first (an open socket would keep the server waiting), then stop the
  // schedules and let a running job finish before the connections close.
  realtime
    .close()
    .catch((err: unknown) => console.error(err))
    .then(() => scheduler.stop())
    .catch((err: unknown) => console.error(err))
    .finally(() => {
      server.close(() => {
        closeDb()
          .then(() => flushSentry())
          .then(() => process.exit(0))
          .catch((err: unknown) => {
            console.error(err);
            process.exit(1);
          });
      });
    });
});
