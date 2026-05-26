import { buildServer } from './api/server.js';
import { createPool } from './infrastructure/db/pool.js';
import { runMigrations } from './infrastructure/db/migrate.js';

const port = Number(process.env.PORT ?? 3000);

async function main() {
  const pool = createPool();
  await runMigrations(pool);

  const app = await buildServer(pool);

  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Notification Preferences Service listening on :${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
