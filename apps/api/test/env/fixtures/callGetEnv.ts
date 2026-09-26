// Fixture for startupGuardsSmoke.test.ts: spawned as a child process with a
// deliberately bad env so we can assert getEnv()'s real process.exit(1)
// behavior without killing the Vitest process itself.
import { getEnv } from '../../../src/env/index.js';

getEnv();
console.log('env ok');
