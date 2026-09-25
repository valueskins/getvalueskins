import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, db } from './client.js';

async function main(): Promise<void> {
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('migrations applied');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
