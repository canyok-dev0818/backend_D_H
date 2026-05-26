import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool?: pg.Pool): Promise<void> {
  const db = pool ?? createPool();
  const shouldClose = !pool;

  const candidates = [
    join(__dirname, 'migrations', '001_init.sql'),
    join(process.cwd(), 'src/infrastructure/db/migrations/001_init.sql'),
  ];
  let sql: string | undefined;
  for (const path of candidates) {
    try {
      sql = readFileSync(path, 'utf-8');
      break;
    } catch {
      /* try next */
    }
  }
  if (!sql) {
    throw new Error('Migration file 001_init.sql not found');
  }

  await db.query(sql);
  if (shouldClose) {
    await db.end();
  }
}
