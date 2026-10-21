// Fixture for startupCheck.test.ts: spawned as a child process with a bad DATABASE_URL, so the real
// process.exit(1) of exitUnlessDatabaseReady can be asserted without killing Vitest.
import { exitUnlessDatabaseReady } from '../../../src/db/exitUnlessDatabaseReady.js';

await exitUnlessDatabaseReady(process.env.DATABASE_URL ?? '');
console.log('database ok');
process.exit(0);
