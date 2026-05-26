import { runMigrations } from './migrate.js';

runMigrations()
  .then(() => {
    console.log('Migrations applied');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed', err);
    process.exit(1);
  });
