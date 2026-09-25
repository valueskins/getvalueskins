async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('db:seed refuses to run when NODE_ENV=production');
    process.exit(1);
  }

  const { seed } = await import('./seed/index.js');
  await seed();
  console.log('seed complete');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { closeDb } = await import('./client.js');
    await closeDb();
  });
