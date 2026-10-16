// Imported first by index.ts and the job runner, so errors thrown while the rest loads are seen.
// Reads process.env directly: the validated env is built later, and a DSN is the only thing needed.
import { initSentry } from './observability/sentry.js';

initSentry(process.env.SENTRY_DSN?.trim() || undefined, process.env.NODE_ENV ?? 'development');
