import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The db tests share one real Postgres database (never mocked, per
    // CLAUDE.md) and run migrations/truncations against it — running test
    // files in parallel causes concurrent DDL races (duplicate pg_type
    // errors). Force sequential file execution.
    fileParallelism: false,
  },
});
