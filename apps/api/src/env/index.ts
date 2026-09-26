import { existsSync } from 'node:fs';
import type { Env } from './schema.js';
import { EnvValidationError, parseEnv } from './parse.js';
import { getStartupGuardViolations } from './startupGuards.js';

export type { Env } from './schema.js';
export { EnvValidationError, parseEnv } from './parse.js';
export { getStartupGuardViolations, StartupGuardError } from './startupGuards.js';

function formatAndExit(title: string, messages: string[]): never {
  console.error(`${title}:\n${messages.map((m) => `  - ${m}`).join('\n')}`);
  process.exit(1);
}

let cached: Env | undefined;

/** Loads .env (if present), validates it, runs startup guards, and exits
 * with a clear message on any failure. Cached after the first call. */
export function getEnv(): Env {
  if (cached) return cached;

  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  let env: Env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      formatAndExit('Invalid environment configuration', error.issues);
    }
    throw error;
  }

  const violations = getStartupGuardViolations(env);
  if (violations.length > 0) {
    formatAndExit('Startup guard failed', violations);
  }

  cached = env;
  return cached;
}
