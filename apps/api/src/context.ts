import type { Env } from './env/index.js';

/** What route factories need besides the database: config, and a clock tests can control. */
export interface ApiContext {
  env: Env;
  now: () => Date;
}
