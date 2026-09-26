import { createApp } from './app.js';
import { closeDb } from './db/client.js';
import { getEnv } from './env/index.js';

const env = getEnv();
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
