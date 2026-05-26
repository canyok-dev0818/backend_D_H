import Fastify from 'fastify';
import type pg from 'pg';
import { PreferencesService } from '../application/preferences-service.js';
import { PreferencesRepository } from '../infrastructure/db/preferences-repository.js';
import { createConsoleLogger } from '../infrastructure/logging/logger.js';
import { registerRoutes } from './routes.js';
import { registerStaticUi } from './static.js';

export async function buildServer(pool: pg.Pool) {
  const app = Fastify({ logger: false });
  const logger = createConsoleLogger();
  const repo = new PreferencesRepository(pool);
  const service = new PreferencesService(repo, logger);
  registerRoutes(app, service);
  await registerStaticUi(app);
  return app;
}
