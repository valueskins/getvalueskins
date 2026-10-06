import { createApp } from './app.js';
import { closeDb } from './db/client.js';
import { getEnv } from './env/index.js';
import { logger } from './logging/logger.js';
import { razorpayModeFromKeyId } from './razorpay/mode.js';

const env = getEnv();

// SPEC 7.1: log the Razorpay mode at startup (the startup guards already enforce it).
logger.info({ razorpayMode: razorpayModeFromKeyId(env.RAZORPAY_KEY_ID) }, 'razorpay mode');
const app = createApp(env);

const server = app.listen(env.PORT, () => {
  console.log(`api listening on port ${env.PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    closeDb()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        console.error(err);
        process.exit(1);
      });
  });
});
