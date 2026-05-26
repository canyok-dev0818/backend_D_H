import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString?: string): pg.Pool {
  const conn =
    connectionString ??
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5433/notification_preferences';

  return new Pool({ connectionString: conn });
}
