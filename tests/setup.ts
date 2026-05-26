import { createPool } from '../src/infrastructure/db/pool.js';
import { runMigrations } from '../src/infrastructure/db/migrate.js';
import type pg from 'pg';

let pool: pg.Pool;

export function getTestPool(): pg.Pool {
  if (!pool) {
    pool = createPool(
      process.env.DATABASE_URL ??
        'postgres://postgres:postgres@localhost:5433/notification_preferences_test',
    );
  }
  return pool;
}

export async function resetDatabase(): Promise<void> {
  const p = getTestPool();
  await p.query(`
    TRUNCATE preference_commands, user_preferences, user_quiet_hours, users RESTART IDENTITY CASCADE;
  `);
  await runMigrations(p);
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined as unknown as pg.Pool;
  }
}
